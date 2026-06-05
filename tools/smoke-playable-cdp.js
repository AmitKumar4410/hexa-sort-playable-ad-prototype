const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node tools/smoke-playable-cdp.js <url>');
  process.exit(1);
}

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chromePath) {
  console.error('Chrome or Edge executable was not found.');
  process.exit(1);
}

const port = 9333 + Math.floor(Math.random() * 400);
const userDataDir = path.join(os.tmpdir(), `playable-cdp-${Date.now()}`);
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], {
  stdio: ['ignore', 'ignore', 'pipe'],
});

const chromeErrors = [];
chrome.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  if (/error|exception|failed/i.test(text)) {
    chromeErrors.push(text.trim());
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(endpoint, options) {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, options);
  if (!response.ok) {
    throw new Error(`${endpoint} failed with ${response.status}`);
  }
  return response.json();
}

async function waitForChrome() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      await fetchJson('/json/version');
      return;
    } catch (err) {
      await sleep(150);
    }
  }
  throw new Error('Timed out waiting for Chrome DevTools.');
}

async function createPage() {
  try {
    return await fetchJson('/json/new?about:blank', { method: 'PUT' });
  } catch (err) {
    const pages = await fetchJson('/json/list');
    const page = pages.find((target) => target.type === 'page');
    if (!page) {
      throw err;
    }
    return page;
  }
}

async function runCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  ws.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message || JSON.stringify(payload.error)));
      } else {
        resolve(payload.result || {});
      }
      return;
    }

    if (payload.method === 'Runtime.consoleAPICalled') {
      events.push({
        type: `console.${payload.params.type}`,
        text: payload.params.args.map((arg) => arg.value || arg.description || '').join(' '),
      });
    } else if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params.exceptionDetails;
      events.push({
        type: 'exception',
        text: details.exception && details.exception.description
          ? details.exception.description
          : details.text,
      });
    } else if (payload.method === 'Log.entryAdded') {
      events.push({
        type: `log.${payload.params.entry.level}`,
        text: payload.params.entry.text,
      });
    } else if (payload.method === 'Network.loadingFailed') {
      events.push({
        type: 'network.failed',
        text: `${payload.params.errorText} ${payload.params.blockedReason || ''} ${payload.params.canceled ? 'canceled' : ''}`.trim(),
      });
    } else if (payload.method === 'Network.responseReceived') {
      const response = payload.params.response;
      if (response.status >= 400) {
        events.push({
          type: 'network.http',
          text: `${response.status} ${response.url}`,
        });
      }
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url });

  await Promise.race([
    new Promise((resolve) => {
      const listener = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', listener);
          resolve();
        }
      };
      ws.addEventListener('message', listener);
    }),
    sleep(15000),
  ]);

  await sleep(5000);

  const evaluation = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      let webgl = false;
      try {
        webgl = !!(canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
      } catch (err) {}
      return {
        readyState: document.readyState,
        title: document.title,
        bodyText: document.body ? document.body.innerText.slice(0, 500) : '',
        canvasExists: !!canvas,
        canvasWidth: canvas ? canvas.width : null,
        canvasHeight: canvas ? canvas.height : null,
        canvasClientWidth: canvas ? canvas.clientWidth : null,
        canvasClientHeight: canvas ? canvas.clientHeight : null,
        webgl,
        hasSystem: !!window.System,
        hasCocos: !!window.cc,
        playableResourceCount: window.__playableResources ? Object.keys(window.__playableResources).length : null,
      };
    })()`,
  });

  ws.close();
  return {
    events,
    state: evaluation.result ? evaluation.result.value : null,
  };
}

function cleanup() {
  chrome.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (err) {
    // Chrome may keep Crashpad files locked briefly on Windows.
  }
}

(async () => {
  try {
    await waitForChrome();
    const page = await createPage();
    const result = await runCdp(page.webSocketDebuggerUrl);

    console.log(JSON.stringify({
      url,
      state: result.state,
      events: result.events,
      chromeErrors,
    }, null, 2));
  } finally {
    cleanup();
  }
})().catch((err) => {
  cleanup();
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});

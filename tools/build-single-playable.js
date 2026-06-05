const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(projectRoot, 'build');
const sourceDir = path.join(buildRoot, 'web-mobile');
const outputFile = path.join(buildRoot, 'playable-single-fixed.html');

const textExtensions = new Set([
  '.js',
  '.json',
  '.css',
  '.html',
  '.txt',
  '.xml',
  '.atlas',
  '.tmx',
  '.tsx',
  '.plist',
  '.fnt',
  '.vsh',
  '.fsh',
]);

const mimeByExtension = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.dbbin': 'application/octet-stream',
  '.skel': 'application/octet-stream',
  '.pvr': 'application/octet-stream',
  '.pkm': 'application/octet-stream',
  '.astc': 'application/octet-stream',
};

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function getMime(relPath) {
  return mimeByExtension[path.extname(relPath).toLowerCase()] || 'application/octet-stream';
}

function isText(relPath) {
  return textExtensions.has(path.extname(relPath).toLowerCase());
}

function parseTagAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
}

function rewriteImportMap(importMap, importMapSrc) {
  const rewritten = JSON.parse(JSON.stringify(importMap));
  const imports = rewritten.imports || {};
  const mapDir = toPosix(path.posix.dirname(importMapSrc));

  for (const key of Object.keys(imports)) {
    const value = imports[key];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value)) {
      continue;
    }

    const normalized = value.startsWith('./') || value.startsWith('../')
      ? path.posix.normalize(path.posix.join(mapDir, value))
      : path.posix.normalize(value);

    imports[key] = normalized.startsWith('.') ? normalized : `./${normalized}`;
  }

  return rewritten;
}

function buildResourceMap() {
  const resources = {};

  for (const fullPath of walk(sourceDir)) {
    const relPath = toPosix(path.relative(sourceDir, fullPath));
    const mime = getMime(relPath);

    if (isText(relPath)) {
      resources[relPath] = {
        encoding: 'text',
        mime,
        data: readUtf8(fullPath),
      };
    } else {
      resources[relPath] = {
        encoding: 'base64',
        mime,
        data: fs.readFileSync(fullPath).toString('base64'),
      };
    }
  }

  return resources;
}

function makeRuntime(entryScript) {
  return `
(function () {
  'use strict';

  __FFLATE__

  const compressedBase64 = "__COMPRESSED_RESOURCES__";
  const ENTRY_SCRIPT = __ENTRY_SCRIPT__;

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToText(bytes) {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }

    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
      output += String.fromCharCode(bytes[i]);
    }
    return decodeURIComponent(escape(output));
  }

  const compressedBytes = base64ToBytes(compressedBase64);
  const decompressedBytes = window.fflate.unzlibSync(compressedBytes);
  const decompressedText = bytesToText(decompressedBytes);
  const RESOURCES = JSON.parse(decompressedText);

  function textToBytes(text) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text);
    }

    const encoded = unescape(encodeURIComponent(text));
    const bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i += 1) {
      bytes[i] = encoded.charCodeAt(i);
    }
    return bytes;
  }

  function dataUrlToBytes(dataUrl) {
    const comma = dataUrl.indexOf(',');
    return base64ToBytes(comma === -1 ? dataUrl : dataUrl.slice(comma + 1));
  }

  function collapsePath(pathname) {
    const parts = [];
    pathname.split('/').forEach((part) => {
      if (!part || part === '.') {
        return;
      }
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });
    return parts.join('/');
  }

  function decodePath(pathname) {
    try {
      return decodeURIComponent(pathname);
    } catch (err) {
      return pathname;
    }
  }

  function normalizeUrl(input) {
    let url = typeof input === 'string' ? input : input && input.url ? input.url : String(input || '');
    url = url.split('#')[0].split('?')[0].replace(/\\\\/g, '/');

    try {
      url = new URL(url, document.baseURI).href;
    } catch (err) {
      // Keep the original relative URL.
    }

    const base = document.baseURI.split('#')[0].split('?')[0].replace(/\\\\/g, '/').replace(/[^/]*$/, '');
    if (url.indexOf(base) === 0) {
      url = url.slice(base.length);
    } else {
      try {
        const parsed = new URL(url);
        url = parsed.pathname.replace(/^\\/+/, '');
      } catch (err) {
        // Keep the current URL value.
      }
    }

    url = decodePath(url);
    url = url.replace(/^\\/+/, '').replace(/^(\\.\\/)+/, '');
    while (url.indexOf('../') === 0) {
      url = url.slice(3);
    }
    if (url.indexOf('web-mobile/') === 0) {
      url = url.slice('web-mobile/'.length);
    }

    return collapsePath(url);
  }

  const RESOURCE_KEYS = Object.keys(RESOURCES);
  window.__playableResources = RESOURCES;

  function findResource(input) {
    const normalized = normalizeUrl(input);
    if (RESOURCES[normalized]) {
      return normalized;
    }

    const withoutDot = normalized.replace(/^(\\.\\.\\/)+/, '');
    if (RESOURCES[withoutDot]) {
      return withoutDot;
    }

    const suffix = '/' + normalized;
    for (let i = 0; i < RESOURCE_KEYS.length; i += 1) {
      const key = RESOURCE_KEYS[i];
      if (key.endsWith(suffix)) {
        return key;
      }
    }

    return null;
  }

  function getText(pathOrUrl) {
    const path = RESOURCES[pathOrUrl] ? pathOrUrl : findResource(pathOrUrl);
    const resource = path && RESOURCES[path];
    if (!resource) {
      return null;
    }
    if (resource.encoding === 'text') {
      return resource.data;
    }
    return bytesToText(base64ToBytes(resource.data));
  }

  function getBytes(pathOrUrl) {
    const path = RESOURCES[pathOrUrl] ? pathOrUrl : findResource(pathOrUrl);
    const resource = path && RESOURCES[path];
    if (!resource) {
      return null;
    }
    if (resource.encoding === 'text') {
      return textToBytes(resource.data);
    }
    return base64ToBytes(resource.data);
  }

  function getDataUrl(pathOrUrl) {
    const path = RESOURCES[pathOrUrl] ? pathOrUrl : findResource(pathOrUrl);
    const resource = path && RESOURCES[path];
    if (!resource) {
      return null;
    }
    if (resource.encoding === 'base64') {
      return 'data:' + resource.mime + ';base64,' + resource.data;
    }
    return 'data:' + resource.mime + ';charset=utf-8,' + encodeURIComponent(resource.data);
  }

  function patchFetch() {
    if (!window.fetch || !window.Response) {
      return;
    }

    const nativeFetch = window.fetch.bind(window);
    window.fetch = function playableFetch(input, init) {
      const resourcePath = findResource(input);
      if (!resourcePath) {
        return nativeFetch(input, init);
      }

      const resource = RESOURCES[resourcePath];
      const body = resource.encoding === 'text' ? resource.data : base64ToBytes(resource.data);
      return Promise.resolve(new Response(body, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': resource.mime || 'application/octet-stream',
        },
      }));
    };
  }

  function patchXHR() {
    const NativeXHR = window.XMLHttpRequest;
    if (!NativeXHR) {
      return;
    }

    function fire(xhr, type) {
      const event = { type, target: xhr, currentTarget: xhr };
      const handler = xhr['on' + type];
      if (typeof handler === 'function') {
        handler.call(xhr, event);
      }
      const listeners = xhr.__listeners[type] || [];
      listeners.slice().forEach((listener) => listener.call(xhr, event));
    }

    function PlayableXHR() {
      this.__native = null;
      this.__listeners = {};
      this.__headers = {};
      this.__resourcePath = null;
      this.responseType = '';
      this.response = null;
      this.responseText = '';
      this.responseURL = '';
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.timeout = 0;
      this.withCredentials = false;
    }

    PlayableXHR.UNSENT = NativeXHR.UNSENT || 0;
    PlayableXHR.OPENED = NativeXHR.OPENED || 1;
    PlayableXHR.HEADERS_RECEIVED = NativeXHR.HEADERS_RECEIVED || 2;
    PlayableXHR.LOADING = NativeXHR.LOADING || 3;
    PlayableXHR.DONE = NativeXHR.DONE || 4;

    PlayableXHR.prototype.open = function open(method, url, async, user, password) {
      this.__url = url;
      this.__resourcePath = findResource(url);
      this.readyState = 1;
      this.responseURL = url;

      if (!this.__resourcePath) {
        this.__native = new NativeXHR();
        return this.__native.open(method, url, async !== false, user, password);
      }

      fire(this, 'readystatechange');
      return undefined;
    };

    PlayableXHR.prototype.setRequestHeader = function setRequestHeader(name, value) {
      if (this.__native) {
        return this.__native.setRequestHeader(name, value);
      }
      this.__headers[name] = value;
      return undefined;
    };

    PlayableXHR.prototype.getResponseHeader = function getResponseHeader(name) {
      if (this.__native) {
        return this.__native.getResponseHeader(name);
      }
      const resource = this.__resourcePath && RESOURCES[this.__resourcePath];
      return resource && name.toLowerCase() === 'content-type' ? resource.mime : null;
    };

    PlayableXHR.prototype.getAllResponseHeaders = function getAllResponseHeaders() {
      if (this.__native) {
        return this.__native.getAllResponseHeaders();
      }
      const resource = this.__resourcePath && RESOURCES[this.__resourcePath];
      return resource ? 'content-type: ' + resource.mime + '\\r\\n' : '';
    };

    PlayableXHR.prototype.addEventListener = function addEventListener(type, listener) {
      if (!this.__listeners[type]) {
        this.__listeners[type] = [];
      }
      this.__listeners[type].push(listener);
      if (this.__native) {
        this.__native.addEventListener(type, listener);
      }
    };

    PlayableXHR.prototype.removeEventListener = function removeEventListener(type, listener) {
      const listeners = this.__listeners[type];
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
      if (this.__native) {
        this.__native.removeEventListener(type, listener);
      }
    };

    PlayableXHR.prototype.abort = function abort() {
      if (this.__native) {
        return this.__native.abort();
      }
      this.readyState = 0;
      fire(this, 'abort');
      return undefined;
    };

    PlayableXHR.prototype.send = function send(body) {
      if (this.__native) {
        return this.__native.send(body);
      }

      const resource = RESOURCES[this.__resourcePath];
      const bytes = getBytes(this.__resourcePath);
      const text = resource.encoding === 'text' ? resource.data : bytesToText(bytes);

      this.status = 200;
      this.statusText = 'OK';
      this.readyState = 4;

      if (this.responseType === 'arraybuffer') {
        this.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } else if (this.responseType === 'blob') {
        this.response = new Blob([bytes], { type: resource.mime });
      } else if (this.responseType === 'json') {
        this.response = JSON.parse(text);
      } else {
        this.responseText = text;
        this.response = text;
      }

      setTimeout(() => {
        fire(this, 'readystatechange');
        fire(this, 'load');
        fire(this, 'loadend');
      }, 0);

      return undefined;
    };

    window.XMLHttpRequest = PlayableXHR;
  }

  function patchSystemJS() {
    if (!window.System) {
      throw new Error('SystemJS is missing.');
    }

    const proto = Object.getPrototypeOf(window.System);
    const nativeCreateScript = proto && proto.createScript;
    if (!nativeCreateScript) {
      return;
    }

    proto.createScript = function createPlayableScript(url) {
      const resourcePath = findResource(url);
      if (!resourcePath) {
        console.error('Playable resource not found:', url);
        return nativeCreateScript.call(this, url);
      }

      const code = getText(resourcePath) + '\\n//# sourceURL=' + resourcePath;
      const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      return nativeCreateScript.call(this, blobUrl);
    };
  }

  function patchCocos(cc) {
    if (!cc || !cc.assetManager || !cc.assetManager.downloader) {
      return;
    }

    const downloader = cc.assetManager.downloader;
    if (downloader.__playableSinglePatched) {
      return;
    }
    downloader.__playableSinglePatched = true;

    function complete(callback, err, data) {
      if (typeof callback === 'function') {
        callback(err || null, data);
      }
    }

    function missing(url, callback) {
      const err = new Error('Playable resource not found: ' + url);
      console.error(err.message);
      complete(callback, err);
    }

    function loadScript(url, options, onComplete) {
      const code = getText(url);
      if (code == null) {
        missing(url, onComplete);
        return;
      }
      (0, eval)(code + '\\n//# sourceURL=' + normalizeUrl(url));
      complete(onComplete, null);
    }

    function loadJson(url, options, onComplete) {
      const text = getText(url);
      if (text == null) {
        missing(url, onComplete);
        return;
      }
      complete(onComplete, null, JSON.parse(text));
    }

    function loadText(url, options, onComplete) {
      const text = getText(url);
      if (text == null) {
        missing(url, onComplete);
        return;
      }
      complete(onComplete, null, text);
    }

    function loadArrayBuffer(url, options, onComplete) {
      const bytes = getBytes(url);
      if (!bytes) {
        missing(url, onComplete);
        return;
      }
      complete(onComplete, null, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }

    function loadImage(url, options, onComplete) {
      const dataUrl = getDataUrl(url);
      if (!dataUrl) {
        missing(url, onComplete);
        return null;
      }

      const image = new Image();
      image.onload = function onload() {
        complete(onComplete, null, image);
      };
      image.onerror = function onerror() {
        complete(onComplete, new Error('Image failed to load: ' + url));
      };
      image.src = dataUrl;
      return image;
    }

    function loadVideo(url, options, onComplete) {
      const dataUrl = getDataUrl(url);
      if (!dataUrl) {
        missing(url, onComplete);
        return null;
      }

      const video = document.createElement('video');
      video.src = dataUrl;
      complete(onComplete, null, video);
      return video;
    }

    function loadFont(url, options, onComplete) {
      const dataUrl = getDataUrl(url);
      if (!dataUrl || typeof FontFace === 'undefined') {
        complete(onComplete, null, url.split('/').pop().split('.')[0]);
        return;
      }

      const fontName = url.split('/').pop().split('.')[0];
      const font = new FontFace(fontName, 'url(' + dataUrl + ')');
      document.fonts.add(font);
      font.load().then(
        () => complete(onComplete, null, fontName),
        () => complete(onComplete, null, fontName)
      );
    }

    function loadBundle(bundleNameOrUrl, options, onComplete) {
      const bundleName = cc.path.basename(bundleNameOrUrl);
      let bundleUrl = bundleNameOrUrl;
      if (!/^(?:[a-z][a-z0-9+.-]*:|\\/|\\.\\/|\\.\\.\\/|.+\\/)/i.test(bundleUrl)) {
        bundleUrl = 'assets/' + bundleName;
      }

      const version = (options && options.version) || downloader.bundleVers && downloader.bundleVers[bundleName];
      const versionPart = version ? version + '.' : '';
      let config = null;
      let error = null;
      let completeCount = 0;

      function done(err) {
        if (err) {
          error = err;
        }
        completeCount += 1;
        if (completeCount === 2) {
          if (config) {
            config.base = bundleUrl + '/';
          }
          complete(onComplete, error, config);
        }
      }

      loadJson(bundleUrl + '/config.' + versionPart + 'json', options || {}, (err, data) => {
        if (!err) {
          config = data;
        }
        done(err);
      });
      loadScript(bundleUrl + '/index.' + versionPart + 'js', options || {}, done);
    }

    const imageExts = ['.png', '.jpg', '.bmp', '.jpeg', '.gif', '.ico', '.tiff', '.webp', '.image'];
    const videoExts = ['.mp4', '.avi', '.mov', '.mpg', '.mpeg', '.rm', '.rmvb', '.webm'];
    const textExts = ['.txt', '.xml', '.vsh', '.fsh', '.atlas', '.tmx', '.tsx', '.plist', '.fnt'];
    const binaryExts = ['.pvr', '.pkm', '.astc', '.binary', '.bin', '.dbbin', '.skel', '.wasm'];
    const fontExts = ['.font', '.eot', '.ttf', '.woff', '.woff2', '.svg', '.ttc'];

    downloader.downloadScript = loadScript;
    downloader.register('.js', loadScript);
    downloader.register('.json', loadJson);
    imageExts.forEach((ext) => downloader.register(ext, loadImage));
    videoExts.forEach((ext) => downloader.register(ext, loadVideo));
    textExts.forEach((ext) => downloader.register(ext, loadText));
    binaryExts.forEach((ext) => downloader.register(ext, loadArrayBuffer));
    fontExts.forEach((ext) => downloader.register(ext, loadFont));
    downloader.register('bundle', loadBundle);
    downloader.register('default', loadText);
  }

  patchFetch();
  patchXHR();
  patchSystemJS();

  System.import('cc')
    .then((engine) => {
      patchCocos(engine);
    })
    .then(() => System.import(ENTRY_SCRIPT))
    .catch((err) => {
      console.error(err);
      const message = document.createElement('pre');
      message.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45%;overflow:auto;margin:0;padding:12px;background:#220;color:#fff;text-align:left;white-space:pre-wrap;font:12px/1.4 monospace;z-index:999999;';
      message.textContent = err && err.stack ? err.stack : String(err);
      document.body.appendChild(message);
    });
}());
`;
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing Cocos web-mobile build: ${sourceDir}`);
  }

  const indexPath = path.join(sourceDir, 'index.html');
  const indexHtml = readUtf8(indexPath);
  const titleMatch = indexHtml.match(/<title>([\s\S]*?)<\/title>/i);
  const headMatch = indexHtml.match(/<head>([\s\S]*?)<\/head>/i);
  const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const importMapTag = indexHtml.match(/<script\b(?=[^>]*type=["']systemjs-importmap["'])[^>]*>/i);
  const entryMatch = indexHtml.match(/System\.import\(['"]\.\/([^'"]+)['"]\)/);

  if (!headMatch || !bodyMatch || !importMapTag || !entryMatch) {
    throw new Error('Could not parse build/web-mobile/index.html.');
  }

  const importMapSrc = parseTagAttribute(importMapTag[0], 'src');
  if (!importMapSrc) {
    throw new Error('Could not find import map src in build/web-mobile/index.html.');
  }

  const importMap = rewriteImportMap(JSON.parse(readUtf8(path.join(sourceDir, importMapSrc))), importMapSrc);
  const scriptTags = Array.from(indexHtml.matchAll(/<script\b(?=[^>]*src=["'][^"']+["'])(?![^>]*type=["']systemjs-importmap["'])[^>]*>[\s\S]*?<\/script>/gi));
  const linkedScripts = scriptTags
    .map((match) => parseTagAttribute(match[0], 'src'))
    .filter(Boolean);
  const styleTags = Array.from(indexHtml.matchAll(/<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["'][^"']+["'])[^>]*>/gi));
  const linkedStyles = styleTags
    .map((match) => parseTagAttribute(match[0], 'href'))
    .filter(Boolean);

  let cleanHead = headMatch[1]
    .replace(/<link\b(?=[^>]*rel=["']stylesheet["'])[^>]*>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .trim();

  const title = titleMatch ? titleMatch[1].trim() : 'Cocos Playable';
  const styles = linkedStyles
    .map((stylePath) => `\n/* ${stylePath} */\n${readUtf8(path.join(sourceDir, stylePath))}`)
    .join('\n');
  const resources = buildResourceMap();
  const resourceJson = JSON.stringify(resources);
  const compressedBuffer = zlib.deflateSync(Buffer.from(resourceJson, 'utf8'));
  const compressedBase64 = compressedBuffer.toString('base64');
  
  const fflateCode = readUtf8(path.join(__dirname, 'fflate.min.js'));

  const runtime = makeRuntime(`./${entryMatch[1]}`)
    .replace('__FFLATE__', () => fflateCode)
    .replace('__COMPRESSED_RESOURCES__', () => compressedBase64)
    .replace('__ENTRY_SCRIPT__', () => JSON.stringify(`./${entryMatch[1]}`));

  let cleanBody = bodyMatch[1]
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .trim();

  const bootstrapScripts = linkedScripts
    .map((scriptPath) => `<script>\n${escapeScript(readUtf8(path.join(sourceDir, scriptPath)))}\n</script>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
${cleanHead ? cleanHead.split('\n').map((line) => `  ${line}`).join('\n') : ''}
  <style>
${styles}
  </style>
</head>
<body>
${cleanBody}
${bootstrapScripts}
<script type="systemjs-importmap">${escapeScript(JSON.stringify(importMap))}</script>
<script>
${escapeScript(runtime)}
</script>
</body>
</html>
`;

  fs.writeFileSync(outputFile, html, 'utf8');

  const sourceBytes = walk(sourceDir).reduce((total, file) => total + fs.statSync(file).size, 0);
  const outputBytes = fs.statSync(outputFile).size;
  console.log(`Packed ${Object.keys(resources).length} files from ${path.relative(projectRoot, sourceDir)}`);
  console.log(`Source size: ${(sourceBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Output: ${path.relative(projectRoot, outputFile)} (${(outputBytes / 1024 / 1024).toFixed(2)} MB)`);
}

main();

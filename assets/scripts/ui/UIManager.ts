import { _decorator, Button, Component, director, Label, Node, sys, tween, UIOpacity } from 'cc';
import { EventBus } from '../EventBus';
import { GameEvents } from '../data/Events';
import { ShelfRotator } from '../components/ShelfRotator';
import { DOWNLOAD_URL } from '../data/Constant';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property({ type: Node, tooltip: 'The root CTA canvas (holds blur + panel + button).' })
    public ctaCanvas: Node | null = null;

    @property({ type: Node, tooltip: 'The blur/background fade layer.' })
    public blurLayer: Node | null = null;

    @property({ type: Node, tooltip: 'The main CTA panel.' })
    public ctaPanel: Node | null = null;

    @property({ type: Button, tooltip: 'The Download Now button.' })
    public downloadButton: Button | null = null;

    @property({ type: Label, tooltip: 'Optional title text.' })
    public titleLabel: Label | null = null;

    @property({ type: Label, tooltip: 'Optional description text.' })
    public descriptionLabel: Label | null = null;

    @property({ tooltip: 'Duration of blur fade-in animation (seconds).' })
    public blurFadeDuration: number = 0.3;

    @property({ tooltip: 'Delay before panel slides in (seconds).' })
    public panelSlideDelay: number = 0.2;

    @property({ tooltip: 'Duration of panel slide-up animation (seconds).' })
    public panelSlideDuration: number = 0.5;

    @property(Button) closeButton: Button | null = null;

    private _gameRoot: Node | null = null;
    private _isCtaActive: boolean = false;

    onEnable() {
        // Listen for win events from gameplay via EventBus
        EventBus.on(GameEvents.GAME_WON, this.onGameWon, this);
    }

    onDisable() {
        EventBus.off(GameEvents.GAME_WON, this.onGameWon, this);
    }

    onLoad() {
        // Hide CTA on startup
        if (this.ctaCanvas) {
            this.ctaCanvas.active = false;
        }
    }

    /**
     * Called when gameplay emits 'hex-win' event.
     * Disables 3D interaction and activates CTA.
     */
    private onGameWon() {
        console.log('UIManager: 🎉 Game won! Activating CTA...');
        this._isCtaActive = true;

        this.disableGameplayInput();
        this.showCta();
    }

    /**
     * Disable all gameplay input to prevent further rotation/interaction.
     */
    private disableGameplayInput() {
        const scene = director.getScene();
        if (!scene) return;

        // Find and disable ShelfRotator
        const shelfRotator = scene.getComponentInChildren(ShelfRotator);
        if (shelfRotator) {
            shelfRotator.enabled = false;
            console.log('UIManager: Disabled ShelfRotator');
        }
    }

    private enableGameplayInput() {
        const scene = director.getScene();
        if (!scene) return;

        // Find and disable ShelfRotator
        const shelfRotator = scene.getComponentInChildren(ShelfRotator);
        if (shelfRotator) {
            shelfRotator.enabled = true;
            console.log('UIManager: Enabled ShelfRotator');
        }
    }

    /**
     * Fade in blur, then slide in panel with button.
     */
    private showCta() {
        if (!this.ctaCanvas) {
            console.error('UIManager: ctaCanvas is not assigned!');
            return;
        }

        // Make canvas visible
        this.ctaCanvas.active = true;

        // ── STEP 1: Fade in blur ──
        if (this.blurLayer) {
            const opacityComp = this.blurLayer.getComponent(UIOpacity);
            if (!opacityComp) return;
            opacityComp.opacity = 0; // Start transparent
            tween(opacityComp)
                .to(this.blurFadeDuration, { opacity: 180 }, { easing: 'sineInOut' })
                .start();
        }

        // ── STEP 2: Slide in panel (after delay) ──
        if (this.ctaPanel) {
            const panelStartPos = this.ctaPanel.position.clone();
            this.ctaPanel.setPosition(panelStartPos.x, panelStartPos.y - 300); // Start below

            this.scheduleOnce(() => {
                tween(this.ctaPanel!)
                    .to(this.panelSlideDuration, { position: panelStartPos }, { easing: 'backOut' })
                    .start();
            }, this.panelSlideDelay);
        }

        // ── STEP 3: Wire button callback ──
        this.downloadButton?.node.on(Button.EventType.CLICK, this.onDownloadClicked, this);
        this.closeButton?.node.on(Button.EventType.CLICK, this.onCloseClicked, this);
    }

    private onCloseClicked(): void {
        if (this._isCtaActive) {
            console.log('UIManager: Close button clicked!');
            this._isCtaActive = false;
            this.resetCta();
            this.enableGameplayInput();
        }
    }

    /**
     * Called when the Download button is tapped.
     * In a real game, this would open the app store or redirect to download.
     */
    private onDownloadClicked() {
        console.log('UIManager: 📱 Download button clicked!');

        // Open the download URL
        console.log(`Opening: ${DOWNLOAD_URL}`);
        // window.open(DOWNLOAD_URL);
        sys.openURL(DOWNLOAD_URL);

        // Emit event via EventBus for analytics/tracking
        EventBus.emit(GameEvents.CTA_DOWNLOAD_CLICKED);
    }

    /**
     * Optional: Reset CTA for next gameplay session.
     */
    public resetCta() {
        this._isCtaActive = false;
        if (this.ctaCanvas) {
            this.ctaCanvas.active = false;
        }
        this.downloadButton?.node.off(Button.EventType.CLICK, this.onDownloadClicked, this);
        console.log('UIManager: CTA reset.');
        this.closeButton?.node.off(Button.EventType.CLICK, this.onCloseClicked, this);
    }

}



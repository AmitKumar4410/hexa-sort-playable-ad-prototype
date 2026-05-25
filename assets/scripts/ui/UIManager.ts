import { _decorator, Button, Component, director, Label, Node, sys, tween, UIOpacity } from 'cc';
import { EventBus } from '../EventBus';
import { GameEvents } from '../data/Events';
import { ShelfRotator } from '../components/ShelfRotator';
import { DOWNLOAD_URL } from '../data/Constant';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property({ type: Node, tooltip: 'Root canvas for CTA panel.' })
    public ctaCanvas: Node | null = null;

    @property({ type: Node, tooltip: 'Background blur overlay.' })
    public blurLayer: Node | null = null;

    @property({ type: Node, tooltip: 'CTA panel node.' })
    public ctaPanel: Node | null = null;

    @property({ type: Button, tooltip: 'Download button.' })
    public downloadButton: Button | null = null;

    @property({ type: Label, tooltip: 'Title label.' })
    public titleLabel: Label | null = null;

    @property({ type: Label, tooltip: 'Description label.' })
    public descriptionLabel: Label | null = null;

    @property({ tooltip: 'Blur fade duration.' })
    public blurFadeDuration: number = 0.3;

    @property({ tooltip: 'Panel slide in delay.' })
    public panelSlideDelay: number = 0.2;

    @property({ tooltip: 'Panel slide duration.' })
    public panelSlideDuration: number = 0.5;

    @property(Button) closeButton: Button | null = null;

    private _isCtaActive: boolean = false;

    onEnable() {
        // subscribe to game events
        EventBus.on(GameEvents.GAME_WON, this.onGameWon, this);
    }

    onDisable() {
        EventBus.off(GameEvents.GAME_WON, this.onGameWon, this);
    }

    onLoad() {
        // initialize UI state
        if (this.ctaCanvas) {
            this.ctaCanvas.active = false;
        }
    }

    // game won handler
    private onGameWon() {
        console.log('UIManager:Game won! Activating CTA...');
        this._isCtaActive = true;

        this.disableGameplayInput();
        this.showCta();
    }

    // disable shelf rotator node
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

    // animate cta display
    private showCta() {
        if (!this.ctaCanvas) {
            console.error('UIManager: ctaCanvas is not assigned!');
            return;
        }

        // Make canvas visible
        this.ctaCanvas.active = true;

        // fade background in
        if (this.blurLayer) {
            const opacityComp = this.blurLayer.getComponent(UIOpacity);
            if (!opacityComp) return;
            opacityComp.opacity = 0; // Start transparent
            tween(opacityComp)
                .to(this.blurFadeDuration, { opacity: 180 }, { easing: 'sineInOut' })
                .start();
        }

        // animate panel sliding up
        if (this.ctaPanel) {
            const panelStartPos = this.ctaPanel.position.clone();
            this.ctaPanel.setPosition(panelStartPos.x, panelStartPos.y - 300); // Start below

            this.scheduleOnce(() => {
                tween(this.ctaPanel!)
                    .to(this.panelSlideDuration, { position: panelStartPos }, { easing: 'backOut' })
                    .start();
            }, this.panelSlideDelay);
        }

        // setup button listener callbacks
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

    // redirect player to download url
    private onDownloadClicked() {
        console.log('UIManager: Download button clicked!');

        sys.openURL(DOWNLOAD_URL);
        EventBus.emit(GameEvents.CTA_DOWNLOAD_CLICKED);
    }

    // reset UI to default state
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



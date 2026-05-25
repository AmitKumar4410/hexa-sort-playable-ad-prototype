import { _decorator, Button, Component, Label, Node, sys, tween, UIOpacity } from 'cc';
import { EventBus } from '../EventBus';
import { GameEvents } from '../data/Events';
import { ShelfRotator } from '../components/ShelfRotator';
import { DOWNLOAD_URL } from '../data/Constant';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Node) public ctaCanvas: Node | null = null;
    @property(Node) public blurLayer: Node | null = null;
    @property(Node) public ctaPanel: Node | null = null;
    @property(Button) public downloadButton: Button | null = null;
    @property(Button) public closeButton: Button | null = null;
    @property(ShelfRotator) public shelfRotator: ShelfRotator | null = null;

    @property({ tooltip: 'Blur fade duration.' })
    public blurFadeDuration: number = 0.3;

    @property({ tooltip: 'Panel slide in delay.' })
    public panelSlideDelay: number = 0.2;

    @property({ tooltip: 'Panel slide duration.' })
    public panelSlideDuration: number = 0.5;


    onLoad() {
        if (this.ctaCanvas) this.ctaCanvas.active = false;
    }

    onEnable() {
        EventBus.on(GameEvents.GAME_WON, this.onGameWon, this);
    }

    onDisable() {
        EventBus.off(GameEvents.GAME_WON, this.onGameWon, this);
    }

    private onGameWon() {
        if (this.shelfRotator) this.shelfRotator.enabled = false;
        this.showCta();
    }

    private showCta() {
        if (!this.ctaCanvas) return;
        this.ctaCanvas.active = true;

        // fade background in
        if (this.blurLayer) {
            const opacity = this.blurLayer.getComponent(UIOpacity);
            if (opacity) {
                opacity.opacity = 0;
                tween(opacity)
                    .to(this.blurFadeDuration, { opacity: 180 }, { easing: 'sineInOut' })
                    .start();
            }
        }

        // slide panel up
        if (this.ctaPanel) {
            const startPos = this.ctaPanel.position.clone();
            this.ctaPanel.setPosition(startPos.x, startPos.y - 300);
            this.scheduleOnce(() => {
                tween(this.ctaPanel!)
                    .to(this.panelSlideDuration, { position: startPos }, { easing: 'backOut' })
                    .start();
            }, this.panelSlideDelay);
        }

        this.downloadButton?.node.on(Button.EventType.CLICK, this.onDownloadClicked, this);
        this.closeButton?.node.on(Button.EventType.CLICK, this.onCloseClicked, this);
    }

    private onCloseClicked() {
        this.resetCta();
        if (this.shelfRotator) this.shelfRotator.enabled = true;
    }

    private onDownloadClicked() {
        sys.openURL(DOWNLOAD_URL);
        EventBus.emit(GameEvents.CTA_DOWNLOAD_CLICKED);
    }

    public resetCta() {
        if (this.ctaCanvas) this.ctaCanvas.active = false;
        this.downloadButton?.node.off(Button.EventType.CLICK, this.onDownloadClicked, this);
        this.closeButton?.node.off(Button.EventType.CLICK, this.onCloseClicked, this);
    }
}
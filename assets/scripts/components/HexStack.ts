import { _decorator, BoxCollider, CCInteger, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

export interface StackVerticalBounds {
    topOffset: number;
    bottomOffset: number;
}

@ccclass('HexStack')
export class HexStack extends Component {
    // Color ID (0=Blue, 1=Green, etc.)
    @property(CCInteger) public colorId: number = 0;

    // Current tile height of stack
    @property(CCInteger) public tileCount: number = 6;

    // Current grid coordinates
    public currentTier: number = -1;
    public currentIndex: number = -1;

    public syncVisualTiles(fallbackTileSpacing: number = 0.05) {
        const container = this.node.children[0];
        if (!container) return;

        const tiles = container.children;
        if (tiles.length === 0) return;

        const spacing = this.detectTileSpacing(fallbackTileSpacing);

        for (let i = 0; i < tiles.length; i++) {
            tiles[i].active = i < this.tileCount;
        }

        const collider = this.getComponent(BoxCollider);
        if (collider) {
            const bounds = this.getVisualBounds(spacing);
            const height = 0.23;

            const size = collider.size.clone();
            size.y = height;
            collider.size = size;

            const center = collider.center.clone();
            center.y = (bounds.topOffset + bounds.bottomOffset) * 0.5;
            collider.center = center;
        }
    }

    public getVisualBounds(fallbackTileSpacing: number = 0.05): StackVerticalBounds {
        const container = this.node;
        const visibleTiles = container?.children ?? [];
        const spacing = this.detectTileSpacing(fallbackTileSpacing);

        if (visibleTiles.length === 0) {
            return {
                topOffset: 0,
                bottomOffset: -spacing,
            };
        }

        let minCenterY = Number.POSITIVE_INFINITY;
        let maxCenterY = Number.NEGATIVE_INFINITY;

        for (const tile of visibleTiles) {
            minCenterY = Math.min(minCenterY, tile.position.y);
            maxCenterY = Math.max(maxCenterY, tile.position.y);
        }

        const halfTile = spacing * 0.5;
        return {
            topOffset: maxCenterY + halfTile,
            bottomOffset: minCenterY - halfTile,
        };
    }

    private detectTileSpacing(fallbackTileSpacing: number): number {
        const tiles = this.node?.children ?? [];
        let spacing = Number.POSITIVE_INFINITY;

        for (let i = 1; i < tiles.length; i++) {
            const delta = Math.abs(tiles[i].position.y - tiles[i - 1].position.y);
            if (delta > 0.0001 && delta < spacing) {
                spacing = delta;
            }
        }

        return Number.isFinite(spacing) ? spacing : fallbackTileSpacing;
    }
}



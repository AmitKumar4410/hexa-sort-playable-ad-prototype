import { _decorator, Component, Node, PhysicsSystem, tween, Tween, Vec3 } from 'cc';
import { GridModel } from './GridModel';
import { GridView } from './GridView';
import { StackMover } from './StackMover';
import { HexStack } from './HexStack';
import { SHELF_EVENTS } from './ShelfRotator';
import { ShelfSnappedPayload } from '../data/Events';
const { ccclass, property } = _decorator;

@ccclass('ShelfMatchChecker')
export class ShelfMatchChecker extends Component {
    // Set by HexGridController after init
    public gridModel: GridModel | null = null;
    public gridView: GridView | null = null;
    public stackMover: StackMover | null = null;

    /** The node that ShelfRotator lives on — we listen to its events. */
    @property({ type: Node, tooltip: 'The node that has the ShelfRotator component.' })
    public shelfRotatorNode: Node | null = null;

    private _isClearingColumn: boolean = false;


    onEnable() {
        if (!this.shelfRotatorNode) {
            console.error('AlignmentChecker: shelfRotatorNode is not assigned!');
            return;
        }
        this.shelfRotatorNode.on(SHELF_EVENTS.SHELF_SNAPPED, this.onShelfSnapped, this);
    }

    onDisable() {
        this.shelfRotatorNode?.off(SHELF_EVENTS.SHELF_SNAPPED, this.onShelfSnapped, this);
    }


    private onShelfSnapped(payload: ShelfSnappedPayload) {
        console.log(`AlignmentChecker: 🔍 Snapped tier ${payload.tier}! Checking collection match...`);
        this.checkAllTiersForCollection();
    }

    public updateStackVerticalPositions() {
        // Renamed/repurposed to trigger collection check instead of vertical stacking
        this.checkAllTiersForCollection();
    }

    private checkAllTiersForCollection() {
        if (!this.gridModel || !this.gridView || !this.stackMover || this._isClearingColumn) return;
        if (this.stackMover.isMoving) return; // Wait for current animation to finish

        for (let t = 0; t < this.gridModel.tiers; t++) {
            const tierSlots = this.gridModel.getTierSnapshot(t);
            for (const slot of tierSlots) {
                const worldIndex = (slot.index + this.gridModel.shelfAngleOffset[t]) % this.gridModel.slotsPerTier;
                if (worldIndex === 0 && slot.isOccupied && slot.stack) {
                    if (this.gridModel.canCollect(slot.stack.colorId)) {
                        this.collectStack(t, slot.stack);
                        return; // Process one at a time for "drop one by one" effect
                    }
                }
            }
        }
    }

    private collectStack(tier: number, stack: HexStack) {
        if (!this.gridModel || !this.gridView || !this.stackMover) return;

        const collectionWorldPos = this.gridView.getCollectionWorldPosition();
        if (!collectionWorldPos) return;

        // Temporarily lock the tier from being rotated while animating
        this.gridModel.lockedTiers[tier] = true;

        this.stackMover.moveStackToCollection(
            stack.node,
            collectionWorldPos,
            stack,
            this.gridModel,
            (newTileCount) => {
                this.gridModel!.lockedTiers[tier] = false;

                if (newTileCount >= this.stackMover!.winThreshold) {
                    this.scheduleFullColumnClear();
                } else {
                    // Check if other tiers can fall in
                    this.checkAllTiersForCollection();
                }
            }
        );
    }

    private scheduleFullColumnClear() {
        this._isClearingColumn = true;
        console.log("AlignmentChecker: 🎉 COLLECTION CLEAR! Threshold reached!");

        // if (this.stackMover && this.stackMover.winEffect) {
        //     this.stackMover.winEffect.active = true;
        //     const ps = this.stackMover.winEffect.getComponent(ParticleSystem);
        //     ps?.play();
        // }

        const collectionNode = this.gridView?.getCollectionNode();

        this.scheduleOnce(() => {
            if (collectionNode) {
                const children = [...collectionNode.children];
                for (const child of children) {
                    Tween.stopAllByTarget(child);
                    tween(child)
                        .to(0.3, { scale: Vec3.ZERO })
                        .call(() => {
                            child.destroy();
                        })
                        .start();
                }
            }

            this.scheduleOnce(() => {
                PhysicsSystem.instance.syncSceneToPhysics();
                this.gridModel?.clearCollection();
                this._isClearingColumn = false;

                // Check if any other stacks were waiting to fall in
                this.checkAllTiersForCollection();

                // Emit win event via EventBus
                // EventBus.emit(GameEvents.GAME_WON);
            }, 0.35);

        }, 0.5);
    }
}
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

    @property(Node) public shelfRotatorNode: Node | null = null;

    private _isClearingColumn: boolean = false;


    onEnable() {
        if (!this.shelfRotatorNode) {
            console.error('ShelfMatchChecker: shelfRotatorNode not assigned');
            return;
        }
        this.shelfRotatorNode.on(SHELF_EVENTS.SHELF_SNAPPED, this.onShelfSnapped, this);
    }

    onDisable() {
        this.shelfRotatorNode?.off(SHELF_EVENTS.SHELF_SNAPPED, this.onShelfSnapped, this);
    }


    private onShelfSnapped(payload: ShelfSnappedPayload) {
        console.log(`ShelfMatchChecker: Tier ${payload.tier} snapped, checking matches`);
        this.checkAllTiersForCollection();
    }

    public updateStackVerticalPositions() {
        // trigger collection check
        this.checkAllTiersForCollection();
    }

    private checkAllTiersForCollection() {
        if (!this.gridModel || !this.gridView || !this.stackMover || this._isClearingColumn) return;
        if (this.stackMover.isMoving) return; // wait for move to finish

        for (let t = 0; t < this.gridModel.tiers; t++) {
            const tierSlots = this.gridModel.getTierSnapshot(t);
            for (const slot of tierSlots) {
                const worldIndex = (slot.index + this.gridModel.shelfAngleOffset[t]) % this.gridModel.slotsPerTier;
                if (worldIndex === 0 && slot.isOccupied && slot.stack) {
                    if (this.gridModel.canCollect(slot.stack.colorId)) {
                        this.collectStack(t, slot.stack);
                        return; // drop one by one
                    }
                }
            }
        }
    }

    private collectStack(tier: number, stack: HexStack) {
        if (!this.gridModel || !this.gridView || !this.stackMover) return;

        const collectionWorldPos = this.gridView.getCollectionWorldPosition();
        if (!collectionWorldPos) return;

        // lock tier rotation while stack is moving
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
                    // check if more stacks can fall in
                    this.checkAllTiersForCollection();
                }
            }
        );
    }

    private scheduleFullColumnClear() {
        this._isClearingColumn = true;
        console.log("ShelfMatchChecker: Collection clear threshold reached");

        const collectionNode = this.gridView?.getCollectionNode();

        this.scheduleOnce(() => {
            if (collectionNode) {
                const children = [...collectionNode.children].reverse();
                let destroyed = 0;

                children.forEach((child, i) => {
                    // stagger each stack's pop so they cascade one after another
                    this.playDestroyAnimation(child, i * 0.08, () => {
                        destroyed++;
                        if (destroyed === children.length) {
                            this.scheduleOnce(() => {
                                PhysicsSystem.instance.syncSceneToPhysics();
                                this.gridModel?.clearCollection();
                                this._isClearingColumn = false;
                                this.checkAllTiersForCollection();
                            }, 0.1);
                        }
                    });
                });
            } else {
                // fallback if collection node is missing
                this.scheduleOnce(() => {
                    PhysicsSystem.instance.syncSceneToPhysics();
                    this.gridModel?.clearCollection();
                    this._isClearingColumn = false;
                    this.checkAllTiersForCollection();
                }, 0.35);
            }
        }, 0.4);
    }

    private playDestroyAnimation(node: Node, delay: number, onDone: () => void) {
        Tween.stopAllByTarget(node);
        const s = node.scale.clone();
        const e = node.eulerAngles.clone();
        const spinDir = 1;
        const spinAngle = e.y + spinDir * 45;

        this.scheduleOnce(() => {
            tween(node)
                .to(0.08, { scale: new Vec3(s.x * 1.25, s.y * 1.25, s.z * 1.25) }, { easing: 'quadOut' })
                .parallel(
                    tween(node).to(0.22, { scale: Vec3.ZERO }, { easing: 'backIn' }),
                    tween(node).to(0.22, { eulerAngles: new Vec3(e.x, spinAngle, e.z) }, { easing: 'quadIn' })
                )
                .call(() => {
                    node.destroy();
                    onDone();
                })
                .start();
        }, delay);
    }
}

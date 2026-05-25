import { _decorator, Component, Node, tween, Tween, Vec3 } from 'cc';
import { HexStack } from './HexStack';
import { GridModel } from './GridModel';
const { ccclass, property } = _decorator;

@ccclass('StackMover')
export class StackMover extends Component {
    @property({ tooltip: 'Required stacks in collection to win.' })
    public winThreshold: number = 6;

    @property({ tooltip: 'Lift height for movement animation.' })
    public liftHeight: number = 2.0;

    @property({ tooltip: 'Duration of lift phase.' })
    public liftDuration: number = 0.15;

    @property({ tooltip: 'Duration of drop phase.' })
    public dropDuration: number = 0.4;

    @property({ type: Node, tooltip: 'Target collection node.' })
    public collectionStack: Node | null = null;

    private _isMoving: boolean = false;
    get isMoving() { return this._isMoving; }

    onLoad() {
        this.winThreshold = 6;
    }

    public moveStackToCollection(
        stackNode: Node,
        targetWorldPos: Vec3,
        fromStack: HexStack,
        model: GridModel,
        onComplete?: (newTileCount: number) => void
    ) {
        if (this._isMoving) return;
        this._isMoving = true;

        // default vertical position
        let collectionTopY = targetWorldPos.y;

        if (this.collectionStack && this.collectionStack.children.length > 0) {
            let maxTopY = targetWorldPos.y;
            for (const child of this.collectionStack.children) {
                const stackComp = child.getComponent(HexStack);
                if (stackComp) {
                    const bounds = stackComp.getVisualBounds(0.5); // 0.05 is default spacing
                    const childTopY = child.worldPosition.y + bounds.topOffset;
                    if (childTopY > maxTopY) {
                        maxTopY = childTopY;
                    }
                }
            }
            collectionTopY = maxTopY;
        }

        const fromBounds = fromStack.getVisualBounds(0.5);
        const dropY = collectionTopY - fromBounds.bottomOffset;
        const dropPos = new Vec3(targetWorldPos.x, dropY, targetWorldPos.z);

        Tween.stopAllByTarget(stackNode);
        tween(stackNode)
            .to(this.dropDuration, { worldPosition: dropPos }, { easing: 'bounceOut' })
            .call(() => {
                this._isMoving = false;

                // update board model
                const colorId = fromStack.colorId;
                const count = fromStack.tileCount;

                model.setSlotOccupied(fromStack.currentTier, fromStack.currentIndex, false, null);
                model.collect(colorId, count);
                model.collectionStackCount += 1;

                if (this.collectionStack) {
                    stackNode.setParent(this.collectionStack, true);
                }

                const newStackCount = this.collectionStack ? this.collectionStack.children.length : 0;

                onComplete?.(newStackCount);
            })
            .start();
    }
}



import { _decorator, Component, Node, tween, Tween, Vec3 } from 'cc';
import { HexStack } from './HexStack';
import { GridModel } from './GridModel';
import { EventBus } from '../EventBus';
import { GameEvents } from '../data/Events';
const { ccclass, property } = _decorator;

@ccclass('StackMover')
export class StackMover extends Component {
    @property({ tooltip: 'Number of tiles in a stack to trigger the win celebration.' })
    public winThreshold: number = 6;

    @property({ tooltip: 'Height the stack lifts off before flying to destination.' })
    public liftHeight: number = 2.0;

    @property({ tooltip: 'Duration of the lift animation in seconds.' })
    public liftDuration: number = 0.15;

    @property({ tooltip: 'Duration of the fly-over animation in seconds.' })
    public flyDuration: number = 0.3;

    @property({ tooltip: 'Duration of the drop animation in seconds.' })
    public dropDuration: number = 0.15;

    @property({ type: Node, tooltip: '(Optional) A particle effect node to play on win.' })
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

        // const startWorldPos = stackNode.worldPosition.clone();

        // Find the collection node to compute precise drop height
        // const gridRoot = stackNode.parent?.parent?.parent; // pivot -> shelf -> grid
        // const this.collectionStack = gridRoot?.getChildByName('CollectionColumn');

        // Default to targetWorldPos.y if empty
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
            .to(this.flyDuration, { worldPosition: dropPos }, { easing: 'bounceOut' })
            .call(() => {
                this._isMoving = false;

                // Update model
                const colorId = fromStack.colorId;
                const count = fromStack.tileCount;

                model.setSlotOccupied(fromStack.currentTier, fromStack.currentIndex, false, null);
                model.collect(colorId, count);
                model.collectionStackCount += 1;  // Track number of stacks, not just tiles

                // // Reparent to collection node
                // const gridRoot = stackNode.parent?.parent?.parent; // pivot -> shelf -> grid
                // const this.collectionStack = gridRoot?.getChildByName('CollectionColumn');

                if (this.collectionStack) {
                    stackNode.setParent(this.collectionStack, true);
                    // the tween already placed it at the correct world position
                }

                const newStackCount = this.collectionStack ? this.collectionStack.children.length : 0;

                // Check win condition based on number of STACKS, not individual tiles
                if (newStackCount >= this.winThreshold) {
                    this.triggerWin();
                }

                onComplete?.(newStackCount);
            })
            .start();
    }

    private triggerWin() {
        console.log('StackMover: WIN CONDITION MET!');
        EventBus.emit(GameEvents.GAME_WON);
    }
}



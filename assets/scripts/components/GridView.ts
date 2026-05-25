import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
import { GridModel } from './GridModel';
import { GridCellFactory } from './GridCellFactory';
import { HexStack } from './HexStack';
const { ccclass } = _decorator;

@ccclass('GridView')
export class GridView extends Component {
    private _slotsPerTier: number = 0;
    private _radius: number = 0;
    private _tierHeight: number = 0;
    private _tierCount: number = 0;

    // Shelf nodes indexed by tier — ShelfRotator accesses these directly
    private _shelfNodes: Node[] = [];
    private _collectionNode: Node | null = null;

    // build grid hierarchy and shelves
    public buildGrid(model: GridModel, factory: GridCellFactory, radius: number, tierHeight: number, collectionNode: Node) {
        this._radius = radius;
        this._tierHeight = tierHeight;
        this._shelfNodes = [];

        // Clear any existing children before rebuilding
        this.node.removeAllChildren();

        const allSlots = model.getAllSlots();
        this._slotsPerTier = allSlots.filter(s => s.tier === 0).length;
        this._tierCount = model.tiers;
        const angleInterval = 360 / this._slotsPerTier;

        // Create shelf nodes
        for (let t = 0; t < this._tierCount; t++) {
            const shelfNode = new Node(`Shelf_Tier_${t}`);
            shelfNode.setPosition(new Vec3(0, t * tierHeight, 0));
            this.node.addChild(shelfNode);
            this._shelfNodes.push(shelfNode);
        }

        // Set reference to collection node
        this._collectionNode = collectionNode;

        // Setup pivots for radial layout
        allSlots.forEach(slotData => {
            const shelf = this._shelfNodes[slotData.tier];

            const pivotNode = new Node(`Pivot_Idx${slotData.index}`);
            shelf.addChild(pivotNode);
            pivotNode.setPosition(Vec3.ZERO);

            const angleInDegrees = slotData.index * angleInterval;
            const rotationQuat = new Quat();
            Quat.fromEuler(rotationQuat, 0, angleInDegrees, 0);
            pivotNode.setRotation(rotationQuat);
        });
    }

    //#region Public accessors for shelfrotator and shelf match cheker.

    // get specific shelf node
    public getShelfNode(tier: number): Node | null {
        return this._shelfNodes[tier] ?? null;
    }

    public getCollectionNode(): Node | null {
        return this._collectionNode;
    }

    public getCollectionWorldPosition(): Vec3 | null {
        return this._collectionNode ? this._collectionNode.worldPosition.clone() : null;
    }

    // get all shelf nodes
    public getAllShelfNodes(): Node[] {
        return [...this._shelfNodes];
    }

    // slot count per tier
    public get slotsPerTier(): number {
        return this._slotsPerTier;
    }

    // height delta between shelves
    public get tierHeight(): number {
        return this._tierHeight;
    }
    //#endregion

    //#region Stack placement
    // parent stack to its respective slot pivot
    public placeStackOnSlot(stackNode: Node, tier: number, index: number) {
        const shelf = this._shelfNodes[tier];
        if (!shelf) {
            console.error(`HexGridView: No shelf for tier ${tier}`);
            return;
        }

        const pivotNode = shelf.getChildByName(`Pivot_Idx${index}`);
        if (!pivotNode) {
            console.error(`HexGridView: No pivot for index ${index} on tier ${tier}`);
            return;
        }

        pivotNode.addChild(stackNode);
        stackNode.setPosition(new Vec3(0, 0, this._radius));

        // cache coordinates on components
        const stackComp = stackNode.getComponent(HexStack);
        if (stackComp) {
            stackComp.currentTier = tier;
            stackComp.currentIndex = index;
        }
    }
    //#endregion


    //#region World Pos Query
    // get visual world position of slot
    public getSlotWorldPosition(tier: number, index: number): Vec3 | null {
        const shelf = this._shelfNodes[tier];
        if (!shelf) return null;

        const pivotNode = shelf.getChildByName(`Pivot_Idx${index}`);
        if (!pivotNode) return null;

        const slotNode = pivotNode.getChildByName(`Slot_${tier}_${index}`);
        if (!slotNode) return null;

        return slotNode.worldPosition.clone();
    }
    //#endregion
}



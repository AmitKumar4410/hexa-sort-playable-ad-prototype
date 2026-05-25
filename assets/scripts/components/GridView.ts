import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
import { GridModel } from './GridModel';
import { GridCellFactory } from './GridCellFactory';
import { HexStack } from './HexStack';
const { ccclass, property } = _decorator;

@ccclass('GridView')
export class GridView extends Component {
    private _slotsPerTier: number = 0;
    private _radius: number = 0;
    private _tierHeight: number = 0;
    private _tierCount: number = 0;

    // Shelf nodes indexed by tier — ShelfRotator accesses these directly
    private _shelfNodes: Node[] = [];
    private _collectionNode: Node | null = null;

    /**
     * Builds the full visual grid with one Shelf node per tier.
     * Each shelf's children are Pivot → Slot, laid out radially.
     */
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

        // ── Step 1: Create one Shelf node per tier ──────────────────
        for (let t = 0; t < this._tierCount; t++) {
            const shelfNode = new Node(`Shelf_Tier_${t}`);
            shelfNode.setPosition(new Vec3(0, t * tierHeight, 0));
            this.node.addChild(shelfNode);
            this._shelfNodes.push(shelfNode);
        }

        // ── Step 1.5: Create Fixed Collection Column ──────────────────
        // This is not a child of any tier, so it does not rotate.
        // const collectionNode = new Node('CollectionColumn');
        // collectionNode.setPosition(new Vec3(0, -0.116, radius));
        // this.node.addChild(collectionNode);
        this._collectionNode = collectionNode;

        // ── Step 2: Add Pivot + Slot children to each shelf ─────────
        allSlots.forEach(slotData => {
            const shelf = this._shelfNodes[slotData.tier];

            // Pivot rotates around Y so the slot faces outward at the right angle
            const pivotNode = new Node(`Pivot_Idx${slotData.index}`);
            shelf.addChild(pivotNode);
            pivotNode.setPosition(Vec3.ZERO);   // pivot is at shelf centre

            const angleInDegrees = slotData.index * angleInterval;
            const rotationQuat = new Quat();
            Quat.fromEuler(rotationQuat, 0, angleInDegrees, 0);
            pivotNode.setRotation(rotationQuat);

            // Slot node sits at radius distance along local Z
            // const slotNode = factory.createSlot();
            // slotNode.name = `Slot_${slotData.tier}_${slotData.index}`;
            // pivotNode.addChild(slotNode);
            // slotNode.setPosition(new Vec3(0, 0, radius));
        });
    }

    // ─────────────────────────────────────────────────────────────────
    //  PUBLIC ACCESSORS — used by ShelfRotator and AlignmentChecker
    // ─────────────────────────────────────────────────────────────────

    /**
     * Returns the rotatable shelf Node for a given tier.
     * ShelfRotator holds a reference to each of these and spins them.
     */
    public getShelfNode(tier: number): Node | null {
        return this._shelfNodes[tier] ?? null;
    }

    public getCollectionNode(): Node | null {
        return this._collectionNode;
    }

    public getCollectionWorldPosition(): Vec3 | null {
        return this._collectionNode ? this._collectionNode.worldPosition.clone() : null;
    }

    /** Returns all shelf nodes in tier order (0 = bottom). */
    public getAllShelfNodes(): Node[] {
        return [...this._shelfNodes];
    }

    /** How many slots are on each tier ring. Used for snap angle math. */
    public get slotsPerTier(): number {
        return this._slotsPerTier;
    }

    /** The vertical height between shelves. */
    public get tierHeight(): number {
        return this._tierHeight;
    }

    // ─────────────────────────────────────────────────────────────────
    //  STACK PLACEMENT — called by HexGridController on spawn
    // ─────────────────────────────────────────────────────────────────

    /**
     * Places a stack node onto a specific slot.
     * The stack becomes a child of the SHELF node (via the pivot chain)
     * so it rotates with the shelf when the player drags.
     */
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

        // Initialize the HexStack component with its grid coordinates
        const stackComp = stackNode.getComponent(HexStack);
        if (stackComp) {
            stackComp.currentTier = tier;
            stackComp.currentIndex = index;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  WORLD POSITION QUERY — used by StackMover for fly animations
    // ─────────────────────────────────────────────────────────────────

    /**
     * Returns the WORLD position of a specific slot.
     * Because the slot is a grandchild of a rotating shelf,
     * worldPosition already accounts for the shelf's current rotation.
     */
    public getSlotWorldPosition(tier: number, index: number): Vec3 | null {
        const shelf = this._shelfNodes[tier];
        if (!shelf) return null;

        const pivotNode = shelf.getChildByName(`Pivot_Idx${index}`);
        if (!pivotNode) return null;

        const slotNode = pivotNode.getChildByName(`Slot_${tier}_${index}`);
        if (!slotNode) return null;

        return slotNode.worldPosition.clone();
    }
}



import { _decorator, Component, Node } from 'cc';
import { HexStack } from './HexStack';
const { ccclass, property } = _decorator;


export interface GridSlotData {
    tier: number;       // The vertical level (row)
    index: number;      // The position around the circle (column)
    isOccupied: boolean;
    stack: HexStack | null;   // Which HexStack component currently sits here
}

@ccclass('GridModel')
export class GridModel {
    private slots: Map<string, GridSlotData> = new Map();
    public readonly tiers: number = 0;
    public readonly slotsPerTier: number = 0;

    /**
     * DESIGN PATTERN: Data Component
     *
     * Each entry tracks how many SLOT STEPS the shelf has been rotated
     * relative to its original position. Updated by ShelfRotator after
     * every successful snap via updateShelfOffset().
     */
    /**
     * Each entry tracks how many SLOT STEPS the shelf has been rotated.
     */
    public shelfAngleOffset: number[] = [];

    /**
     * Tracks which shelves are locked and un-rotatable due to active matches.
     */
    public lockedTiers: boolean[] = [];

    public collectionColorId: number | null = null;
    public collectionTileCount: number = 0;
    public collectionStackCount: number = 0;  // Track number of stacks in collection

    constructor(tiers: number, slotsPerTier: number) {
        this.tiers = tiers;
        this.slotsPerTier = slotsPerTier;
        this.initializeGrid();
    }

    private initializeGrid() {
        this.slots.clear();
        // Initialize all slot offsets to zero
        this.shelfAngleOffset = new Array(this.tiers).fill(0);
        this.lockedTiers = new Array(this.tiers).fill(false);
        this.clearCollection();

        for (let t = 0; t < this.tiers; t++) {
            for (let i = 0; i < this.slotsPerTier; i++) {
                const key = this.getSlotKey(t, i);
                this.slots.set(key, {
                    tier: t,
                    index: i,
                    isOccupied: false,
                    stack: null,
                });
            }
        }
    }

    public getSlotKey(tier: number, index: number): string {
        return `${tier}_${index}`;
    }

    public getSlot(tier: number, index: number): GridSlotData | undefined {
        return this.slots.get(this.getSlotKey(tier, index));
    }

    public setSlotOccupied(tier: number, index: number, occupied: boolean, stack: HexStack | null = null) {
        const slot = this.getSlot(tier, index);
        if (slot) {
            slot.isOccupied = occupied;
            slot.stack = stack;
        }
    }

    public getAllSlots(): GridSlotData[] {
        return Array.from(this.slots.values());
    }

    /**
     * Returns all slots belonging to a single tier.
     * AlignmentChecker uses this to scan an entire tier at once
     * without iterating the full grid.
     */
    public getTierSnapshot(tier: number): GridSlotData[] {
        return Array.from(this.slots.values()).filter(s => s.tier === tier);
    }

    /**
     * Records the snapped rotational offset (in slot-steps) for a shelf.
     * Called by ShelfRotator every time a shelf finishes snapping.
     *
     * @param tier        Which shelf tier was rotated
     * @param stepsDelta  How many slot-steps were added this rotation
     *                    (positive = clockwise, negative = counter-clockwise)
     */
    public updateShelfOffset(tier: number, stepsDelta: number) {
        if (tier < 0 || tier >= this.tiers) return;
        this.shelfAngleOffset[tier] =
            ((this.shelfAngleOffset[tier] + stepsDelta) % this.slotsPerTier + this.slotsPerTier)
            % this.slotsPerTier;
    }

    /**
     * Given a LOCAL slot index on a specific tier, returns the index
     * that is ACTUALLY aligned with it on an ADJACENT tier.
     *
     * Example:
     *   Tier 0 has offset 0, Tier 1 has offset 2.
     *   Tier 1 slot[0] is physically aligned with Tier 0 slot[2].
     *   → getAlignedIndexOnTier(sourceTier=1, sourceIndex=0, targetTier=0) = 2
     */
    // public getAlignedIndexOnTier(sourceTier: number, sourceIndex: number, targetTier: number): number {
    //     const sourceOffset = this.shelfAngleOffset[sourceTier];
    //     const targetOffset = this.shelfAngleOffset[targetTier];
    //     // The stack at sourceIndex has a world angle of (sourceIndex + sourceOffset)
    //     // On the targetTier, world angle maps to local index (worldAngle - targetOffset)
    //     const worldAngleStep = (sourceIndex + sourceOffset) % this.slotsPerTier;
    //     return ((worldAngleStep - targetOffset) % this.slotsPerTier + this.slotsPerTier) % this.slotsPerTier;
    // }

    /**
     * Check if the stack at (tier, index) has the same colorId as the
     * stack on an adjacent tier that is currently vertically aligned with it.
     * Returns null if no match, or the adjacent slot data if match found.
     */
    // public isSameColorVertical(
    //     tier: number,
    //     index: number,
    //     direction: 'up' | 'down'
    // ): GridSlotData | null {
    //     const adjacentTier = direction === 'up' ? tier + 1 : tier - 1;
    //     if (adjacentTier < 0 || adjacentTier >= this.tiers) return null;

    //     const thisSlot = this.getSlot(tier, index);
    //     if (!thisSlot?.stack) return null;

    //     const alignedIdx = this.getAlignedIndexOnTier(tier, index, adjacentTier);
    //     const adjacentSlot = this.getSlot(adjacentTier, alignedIdx);

    //     if (adjacentSlot?.stack && adjacentSlot.stack.colorId === thisSlot.stack.colorId) {
    //         return adjacentSlot;
    //     }
    //     return null;
    // }

    /**
     * Check if two slots hold the same colour.
     * Used by the merge logic before allowing a move.
     */
    // public isSameColor(tierA: number, indexA: number, tierB: number, indexB: number): boolean {
    //     const slotA = this.getSlot(tierA, indexA);
    //     const slotB = this.getSlot(tierB, indexB);
    //     if (!slotA?.stack || !slotB?.stack) return false;
    //     return slotA.stack.colorId === slotB.stack.colorId;
    // }

    /**
     * Merge source stack INTO destination stack.
     * - Adds the source tileCount to the destination
     * - Clears the source slot
     * Returns the new tileCount of the destination.
     */
    // public mergeStacks(
    //     fromTier: number, fromIndex: number,
    //     toTier: number, toIndex: number
    // ): number {
    //     const fromSlot = this.getSlot(fromTier, fromIndex);
    //     const toSlot = this.getSlot(toTier, toIndex);
    //     if (!fromSlot?.stack || !toSlot?.stack) return 0;

    //     toSlot.stack.tileCount += fromSlot.stack.tileCount;
    //     toSlot.stack.syncVisualTiles();
    //     const newCount = toSlot.stack.tileCount;

    //     // Clear source slot
    //     fromSlot.isOccupied = false;
    //     fromSlot.stack = null;

    //     return newCount;
    // }

    // ─────────────────────────────────────────────────────────────────
    //  TIER-LOCKING LOGIC
    // ─────────────────────────────────────────────────────────────────

    /**
     * Check if a specific tier should be locked based on collection height.
     *
     * DYNAMIC RULE: Each tile in the collection locks one more bottom tier.
     *   - 0 tiles collected → no locks
     *   - 1 tile collected → tier 0 locked
     *   - 2 tiles collected → tiers 0, 1 locked
     *   - 3 tiles collected → tiers 0, 1, 2 locked
     *   - etc.
     *
     * This creates a progressive difficulty curve as the collection grows.
     *
     * @param tier The tier to check (0 = bottom)
     * @returns true if the tier should be locked due to collection height
     */
    public shouldTierBeLocked(tier: number): boolean {
        return tier < this.collectionStackCount;
    }

    /**
     * Returns an array of which tiers are currently locked by height rules.
     * Does NOT include animation-based locks (those in lockedTiers).
     * Used by UI or debug visualization.
     */
    public getHeightBasedLocks(): boolean[] {
        const locks = new Array(this.tiers).fill(false);
        for (let t = 0; t < this.tiers; t++) {
            locks[t] = this.shouldTierBeLocked(t);
        }
        return locks;
    }

    /**
     * Check if there's a non-matching (uncollectible) stack at worldIndex 0 on a tier.
     * Used to prevent leaving unmatched stacks at the collection point.
     *
     * @param tier The tier to check
     * @returns true if a non-collectible stack is at world index 0
     */
    public hasNonMatchingStackAtIndex0(tier: number): boolean {
        const tierSlots = this.getTierSnapshot(tier);
        for (const slot of tierSlots) {
            const worldIndex = (slot.index + this.shelfAngleOffset[tier]) % this.slotsPerTier;
            if (worldIndex === 0 && slot.isOccupied && slot.stack) {
                // Check if this stack can be collected
                if (!this.canCollect(slot.stack.colorId)) {
                    return true;
                }
            }
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    //  COLLECTION COLUMN LOGIC
    // ─────────────────────────────────────────────────────────────────

    public getCollectionState() {
        return { colorId: this.collectionColorId, tileCount: this.collectionTileCount };
    }

    public canCollect(colorId: number): boolean {
        return this.collectionColorId === null || this.collectionColorId === colorId;
    }

    public collect(colorId: number, count: number) {
        if (this.collectionColorId === null) {
            this.collectionColorId = colorId;
        }
        if (this.collectionColorId === colorId) {
            this.collectionTileCount += count;
        }
    }

    public clearCollection() {
        this.collectionColorId = null;
        this.collectionTileCount = 0;
        this.collectionStackCount = 0;
    }
}



import { _decorator } from 'cc';
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

    // shelf rotation offsets in slots
    public shelfAngleOffset: number[] = [];

    // locked tiers that cannot rotate
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

    // get all slots on a specific tier
    public getTierSnapshot(tier: number): GridSlotData[] {
        return Array.from(this.slots.values()).filter(s => s.tier === tier);
    }

    // update rotational offset after snap
    public updateShelfOffset(tier: number, stepsDelta: number) {
        if (tier < 0 || tier >= this.tiers) return;
        this.shelfAngleOffset[tier] =
            ((this.shelfAngleOffset[tier] + stepsDelta) % this.slotsPerTier + this.slotsPerTier)
            % this.slotsPerTier;
    }

    //#region Tier Locking logic

    // check if tier is locked by height limit
    public shouldTierBeLocked(tier: number): boolean {
        return tier < this.collectionStackCount;
    }

    // returns boolean array of height locked tiers
    public getHeightBasedLocks(): boolean[] {
        const locks = new Array(this.tiers).fill(false);
        for (let t = 0; t < this.tiers; t++) {
            locks[t] = this.shouldTierBeLocked(t);
        }
        return locks;
    }

    // returns true if non-matching stack blocks collection point at index 0
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
    //#endregion 

    //#region Collection Column Logic
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
    //#endregion

    public clearCollection() {
        this.collectionColorId = null;
        this.collectionTileCount = 0;
        this.collectionStackCount = 0;
    }
}



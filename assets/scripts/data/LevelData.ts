export interface HexSpawnData {
    tier: number;
    index: number;
    colorId: number;
    tileCount: number;
}

export interface LevelData {
    levelId: number;
    tiers?: number;
    slotsPerTier?: number;
    spawns?: HexSpawnData[];
    tierData?: number[][];
}
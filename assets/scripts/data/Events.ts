// Central Event defined
export const GameEvents = {
    // Input Events
    STACK_TAPPED: 'stack-tapped',
    SLOT_TAPPED: 'slot-tapped',
    EMPTY_TAPPED: 'empty-tapped',

    //Shelf/Rotation Events
    SHELF_SNAPPED: 'shelf-snapped',

    //Stack/Collection Events
    STACK_MOVING: 'stack-moving',
    STACK_MOVED: 'stack-moved',
    STACK_COLLECTED: 'stack-collected',
    COLLECTION_CLEARED: 'collection-cleared',

    //Game State Events
    GAME_WON: 'game-won',
    GAME_RESET: 'game-reset',

    //UI Event
    CTA_DOWNLOAD_CLICKED: 'cta-download-clicked',
} as const;

// Type-safe event payloads
export interface StackTappedPayload {
    stack: any; // HexStack
    worldPosition: any; // Vec3
}

export interface SlotTappedPayload {
    slotNode: any;
    tier: number;
    index: number;
}

export interface ShelfSnappedPayload {
    tier: number;
    snappedAngle: number;
    stepsDelta: number;
}

export interface StackCollectedPayload {
    colorId: number;
    tileCount: number;
    stackCount: number;
}

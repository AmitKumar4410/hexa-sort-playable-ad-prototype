// Central Event defined
export const GameEvents = {
    //Shelf/Rotation Events
    SHELF_SNAPPED: 'shelf-snapped',

    //Game State Events
    GAME_WON: 'game-won',

    //UI Event
    CTA_DOWNLOAD_CLICKED: 'cta-download-clicked',
} as const;

// Type-safe event payloads
export interface ShelfSnappedPayload {
    tier: number;
    snappedAngle: number;
    stepsDelta: number;
}

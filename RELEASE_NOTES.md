# Release Notes

## Version 0.1.0 - Prototype Release

**Built with:** Cocos Creator 3.8.8  
**Date:** May 25, 2026

### Features & Gameplay
- **Core Mechanics:** Added circular grid sorting mechanics where players rotate shelves to sort hexagonal stacks.
- **Dynamic Rotation:** Drag-to-rotate interaction system for shelves with snapping physics.
- **Matching System:** Auto-matching logic that checks and moves matching stacks to the collection point when shelves snap into position.
- **Collection Progression:** Columns clear automatically once the player collects a full set (threshold set to 6 tiles).
- **End-Game CTA:** Integrated a Call To Action (CTA) screen that triggers upon winning the game, complete with fade-in blur animations and a slide-up download prompt to drive conversions.
- **Feedback & Constraints:** Tier locking and bump animations to restrict invalid rotations during active collections or height constraint violations.

### Architecture Highlights (Design Patterns)
- **MVC Structure:** Decoupled `GridModel` (State), `GridView` (Visuals), and `GridController` (Coordinator) for modularity.
- **Event Bus Pattern:** Implemented an `EventBus` to handle loosely-coupled communication (e.g., `SHELF_SNAPPED`, `GAME_WON`) between various game components.
- **Factory Pattern:** Introduced `GridCellFactory` to cleanly manage the instantiation, configuration, and material assignment of the HexStack prefabs.
- **Strategy Pattern:** Created `SnapStrategy` (`NearestSlotSnap`, `MomentumSnap`) to allow flexible swappable algorithms for how the shelves snap into their slots.

# Hexa Sort Playable Ad Prototype

## Project Overview
This project is a playable ad prototype for a "Hexa Sort" style puzzle game, developed using Cocos Creator and TypeScript. The game features a 3D circular grid consisting of multiple rotating tiers (shelves). Each tier holds stacks of colorful hexagonal tiles. The player's objective is to sort or collect the stacks by rotating the shelves to align specific stacks at the front collection point. 

## How to Play
1. **Rotate Shelves**: Tap and drag horizontally on any tier to rotate it.
2. **Snap to Align**: Release your touch to snap the shelf into the nearest slot.
3. **Collect Stacks**: When a shelf snaps into place, the game checks the front-most stack (at world index 0). If the stack matches the current collection condition, it will automatically move into the collection area.
4. **Win the Game**: Keep aligning and collecting matching stacks. Once the collection threshold (default is 6 stacks) is reached, the collected column clears, and the game is won!
5. **Call To Action (CTA)**: Upon winning the game, a Call To Action screen appears with a fade-in overlay and a slide-up panel prompting the user to download the full game. Clicking the download button redirects to the target app store URL.
6. **Restrictions**: Tiers might lock temporarily while a stack is being collected or due to height constraints to prevent conflicts.

## Project Structure and Flow
The codebase is structured to separate data, visuals, and control logic effectively:

- **`assets/scripts/controller/GridController.ts`**: The main entry point that bootstraps the game. It initializes the model, view, and input systems, and spawns the initial level data.
- **`assets/scripts/components/`**:
  - `GridModel.ts`: The data model for the grid. Manages the state of all tiers, slot occupancy, rotation offsets, and collection logic.
  - `GridView.ts`: Handles the visual generation of the 3D circular grid and placing stacks on the shelves.
  - `GridCellFactory.ts`: A factory class responsible for instantiating and configuring `HexStack` prefabs based on level data.
  - `HexStack.ts`: Represents an individual hexagonal stack, storing its color and tile count.
  - `ShelfRotator.ts`: Processes user touch input, performs raycasting to detect the dragged tier, and handles the rotation and snapping animations.
  - `ShelfMatchChecker.ts`: Listens for snap events to evaluate if a stack at the collection point can be collected.
  - `StackMover.ts`: Manages the tweening animations for moving stacks from the grid to the collection area.
- **`assets/scripts/data/`**: Contains level configuration files (e.g., `Level1.json`), interfaces for level data (`LevelData.ts`), and event definitions (`Events.ts`).
- **`assets/scripts/EventBus.ts`**: A central event pub/sub system used to decouple components, allowing them to communicate via events like `SHELF_SNAPPED` and `GAME_WON`.
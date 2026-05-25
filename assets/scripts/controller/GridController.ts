import { _decorator, CCFloat, CCInteger, Component, JsonAsset, Material, Node, Prefab } from 'cc';
import { GridModel } from '../components/GridModel';
import { GridView } from '../components/GridView';
import { GridCellFactory } from '../components/GridCellFactory';
import { ShelfMatchChecker } from '../components/ShelfMatchChecker';
import { ShelfRotator } from '../components/ShelfRotator';
import { StackMover } from '../components/StackMover';
import { LevelData } from '../data/LevelData';
import { HexStack } from '../components/HexStack';
const { ccclass, property } = _decorator;

@ccclass('GridController')
export class GridController extends Component {
    @property(Prefab)
    public stackPrefab: Prefab | null = null;

    @property(CCInteger)
    public tiers: number = 6;

    @property(CCInteger)
    public slotsPerTier: number = 20;

    @property(CCFloat)
    public radius: number = 0.6;

    @property(CCFloat)
    public tierHeight: number = 0.208;

    @property(JsonAsset)
    public levelDataAsset: JsonAsset | null = null;

    @property(Material)
    public hexMaterials: Material[] = [];

    @property(ShelfRotator)
    public shelfRotator: ShelfRotator | null = null;

    @property(StackMover)
    public stackMover: StackMover | null = null;

    @property(ShelfMatchChecker)
    public shelfMatchChecker: ShelfMatchChecker | null = null;

    @property(Node) public collectionNode: Node | null = null;

    // ─── Public References (read by SelectionManager / other systems) ─

    public model: GridModel | null = null;
    public view: GridView | null = null;
    private factory: GridCellFactory | null = null;

    protected start(): void {
        this.initializeGrid();
    }

    /**
     * Wires the entire MVC + Rotation + Alignment pipeline.
     */
    public initializeGrid() {
        if (!this.stackPrefab) {
            console.warn('HexGridController: Stack Prefab is not assigned in the inspector!');
            return;
        }

        let currentTiers = this.tiers;
        let currentSlotsPerTier = this.slotsPerTier;

        if (this.levelDataAsset && this.levelDataAsset.json) {
            const levelData = this.levelDataAsset.json as unknown as LevelData;
            if (levelData.tiers !== undefined) currentTiers = levelData.tiers;
            if (levelData.slotsPerTier !== undefined) currentSlotsPerTier = levelData.slotsPerTier;
        }

        console.log(
            `HexGridController: Building grid — ` +
            `${currentTiers} tiers × ${currentSlotsPerTier} slots, radius=${this.radius}`
        );

        // ── 1. Factory ───────────────────────────────────────────────
        this.factory = new GridCellFactory(this.stackPrefab!);

        // ── 2. Model ─────────────────────────────────────────────────
        this.model = new GridModel(currentTiers, currentSlotsPerTier);

        // ── 3. View ──────────────────────────────────────────────────
        this.view = this.getComponent(GridView);
        if (!this.view) {
            this.view = this.addComponent(GridView);
        }
        this.view.buildGrid(this.model, this.factory, this.radius, this.tierHeight, this.collectionNode);

        // ── 4. ShelfRotator: inject shelf nodes + model reference ─────
        if (this.shelfRotator) {
            this.shelfRotator.shelfNodes = this.view.getAllShelfNodes();
            this.shelfRotator.slotsPerTier = currentSlotsPerTier;
            this.shelfRotator.gridModel = this.model;
            console.log(
                `HexGridController: ShelfRotator wired with ` +
                `${this.shelfRotator.shelfNodes.length} shelf nodes.`
            );
        } else {
            console.warn('HexGridController: ShelfRotator not assigned in inspector!');
        }

        // ── 5. AlignmentChecker: inject all dependencies ──────────────
        if (this.shelfMatchChecker) {
            this.shelfMatchChecker.gridModel = this.model;
            this.shelfMatchChecker.gridView = this.view;
            this.shelfMatchChecker.stackMover = this.stackMover;

            // AlignmentChecker listens to events on the ShelfRotator's node
            if (this.shelfRotator && !this.shelfMatchChecker.shelfRotatorNode) {
                this.shelfMatchChecker.shelfRotatorNode = this.shelfRotator.node;
            }
            console.log('HexGridController: AlignmentChecker wired.');
        } else {
            console.warn('HexGridController: AlignmentChecker not assigned in inspector!');
        }

        // ── 6. Spawn initial stacks ───────────────────────────────────
        this.loadLevelData();

        // ── 7. Run initial drop-alignment check ───────────────────────
        if (this.shelfMatchChecker) {
            this.shelfMatchChecker.updateStackVerticalPositions();
        }
    }

    /**
     * Spawns stacks based on the Data-Driven level JSON.
     */
    private loadLevelData() {
        if (!this.model || !this.view || !this.factory) return;

        if (!this.levelDataAsset || !this.levelDataAsset.json) {
            console.warn("HexGridController: No Level Data Asset assigned! Falling back to empty grid.");
            return;
        }

        const levelData: LevelData = this.levelDataAsset.json as unknown as LevelData;
        let spawns = levelData.spawns;

        // PROCEDURAL GENERATION: Auto-fill if spawns array is empty or missing
        let tCount = levelData.tiers !== undefined ? levelData.tiers : this.tiers;
        let sCount = levelData.slotsPerTier !== undefined ? levelData.slotsPerTier : this.slotsPerTier;

        // If we have the compact 2D tierData array, use that to build spawns
        if (levelData.tierData && levelData.tierData.length > 0) {
            console.log("HexGridController: Using compact tierData array for level.");
            spawns = [];
            for (let t = 0; t < levelData.tierData.length; t++) {
                const tierRow = levelData.tierData[t];
                for (let i = 0; i < tierRow.length; i++) {
                    const colorId = tierRow[i];
                    if (colorId >= 0) { // Support -1 for empty slots
                        spawns.push({
                            tier: t,
                            index: i,
                            colorId: colorId,
                            tileCount: Math.floor(Math.random() * 4) + 1 // random height
                        });
                    }
                }
            }
        } else if (!spawns || spawns.length === 0) {
            console.log("HexGridController: Spawns array is empty. Auto-filling grid procedurally...");
            spawns = [];
            let matCount = this.hexMaterials.length > 0 ? this.hexMaterials.length : 1;

            for (let t = 0; t < tCount; t++) {
                for (let i = 0; i < sCount; i++) {
                    spawns.push({
                        tier: t,
                        index: i,
                        colorId: (t + i) % matCount, // Alternating colors
                        tileCount: Math.floor(Math.random() * 4) + 1 // Random height 1-4
                    });
                }
            }
        }

        for (const spawn of spawns) {
            // Safety Check: Prevent crashing if manual JSON data has indices outside the grid bounds
            if (spawn.tier >= tCount || spawn.index >= sCount) {
                console.warn(`HexGridController: Skipping out-of-bounds spawn at tier ${spawn.tier}, index ${spawn.index}`);
                continue;
            }

            // Use the parameterized factory to create and configure the stack (materials applied)
            const stackNode = this.factory.createConfiguredStack(spawn, this.hexMaterials);
            const stackComp = stackNode.getComponent(HexStack);

            // Place the stack in the view and update the model
            this.view.placeStackOnSlot(stackNode, spawn.tier, spawn.index);
            this.model.setSlotOccupied(spawn.tier, spawn.index, true, stackComp ?? null);
        }
    }
}



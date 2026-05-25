import { _decorator, Camera, Component, director, EventTouch, geometry, Input, input, Node, PhysicsSystem, tween, Vec2, Vec3 } from 'cc';
import { GridModel } from './GridModel';
import { GameEvents, ShelfSnappedPayload } from '../data/Events';
import { EventBus } from '../EventBus';
const { ccclass, property } = _decorator;

// ─── Snap Strategy Interface ────────────────────────────────────────────────
export interface SnapStrategy {
    /**
     * Given the shelf's current angle and the snap interval,
     * return the angle the shelf SHOULD snap to.
     */
    calculate(currentAngle: number, intervalDeg: number, velocityDeg: number): number;
}

/**
 * Always snaps to the nearest slot boundary, regardless of drag velocity.
 */
export class NearestSlotSnap implements SnapStrategy {
    calculate(currentAngle: number, intervalDeg: number, _velocity: number): number {
        return Math.round(currentAngle / intervalDeg) * intervalDeg;
    }
}

/**
 * Snaps one slot further in the direction of the drag if the velocity
 * is above a threshold — gives the shelf a "flick" feel.
 */
export class MomentumSnap implements SnapStrategy {
    constructor(public velocityThreshold: number = 300) { }

    calculate(currentAngle: number, intervalDeg: number, velocityDeg: number): number {
        const nearest = Math.round(currentAngle / intervalDeg) * intervalDeg;
        if (Math.abs(velocityDeg) > this.velocityThreshold) {
            const direction = velocityDeg > 0 ? 1 : -1;
            return nearest + direction * intervalDeg;
        }
        return nearest;
    }
}

// ─── Event payload type ─────────────────────────────────────────────────────
// Imported from ../Events

export const SHELF_EVENTS = {
    SHELF_SNAPPED: 'shelf-snapped',
} as const;

// ─── Internal State Machine ──────────────────────────────────────────────────

enum RotatorState { IDLE, DRAGGING, SNAPPING }

@ccclass('ShelfRotator')
export class ShelfRotator extends Component {
    @property({ tooltip: 'Degrees of rotation per pixel of horizontal drag.' })
    public rotationSpeed: number = 0.4;

    @property({ tooltip: 'Minimum pixel drag before committing to a rotate (vs. a tap).' })
    public dragThreshold: number = 10;

    @property({ tooltip: 'Duration of the snap-to-slot tween in seconds.' })
    public snapDuration: number = 0.2;

    @property({ tooltip: 'Easing for the snap animation. Try backOut or elasticOut for polish.' })
    public snapEasing: string = 'backOut';

    @property({ type: Camera, tooltip: 'Optional. Used to map touches to the nearest visible shelf tier.' })
    public mainCamera: Camera | null = null;

    // Injected by HexGridController after buildGrid()
    public shelfNodes: Node[] = [];
    public slotsPerTier: number = 12;
    public gridModel: GridModel | null = null;

    // Strategy: swap this to MomentumSnap for a flick feel
    public snapStrategy: SnapStrategy = new NearestSlotSnap();

    // ─── Private state ──────────────────────────────────────────────
    private _state: RotatorState = RotatorState.IDLE;
    private _activeTier: number = -1;
    private _lastActiveTier: number = -1;  // Track previous tier for auto-rotate logic

    private _touchStartPos: Vec2 = new Vec2();
    private _lastTouchPos: Vec2 = new Vec2();
    private _totalDragDelta: number = 0;
    private _gestureWasDrag: boolean = false;

    // For velocity-based momentum snapping
    private _lastDeltaX: number = 0;
    private _angleAtDragStart: number = 0;
    private _projectedShelfPos: Vec3 = new Vec3();
    private _ray: geometry.Ray = new geometry.Ray();

    /**
     * Stores the TRUE original Y-angle for every shelf, recorded the very
     * first time that shelf is touched. Used as the reset target so that
     * rotating the same shelf twice does not corrupt the "go back home" angle.
     *
     * DESIGN PATTERN: Registry / Memento (lightweight)
     * We snapshot state once and never overwrite it, giving us a stable
     * restore-point regardless of how many times the shelf has been rotated.
     */
    private _originalShelfAngles: Map<number, number> = new Map();

    // InputManager reads this to decide whether to fire a raycast
    public get isDragging(): boolean {
        return this._gestureWasDrag || this._state === RotatorState.DRAGGING || this._state === RotatorState.SNAPPING;
    }

    // ─── Lifecycle ───────────────────────────────────────────────────
    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    // ─── Touch Handlers ──────────────────────────────────────────────

    private onTouchStart(event: EventTouch) {
        if (this._state === RotatorState.SNAPPING) return;   // Block during snap

        const pos = event.touch!.getLocation();
        this._touchStartPos.set(pos.x, pos.y);
        this._lastTouchPos.set(pos.x, pos.y);
        this._totalDragDelta = 0;
        this._gestureWasDrag = false;
        this._lastDeltaX = 0;
        const selectedTier = this.pickTierFromTouch(pos.x, pos.y);

        // Prevent touching/rotating if any tier is locked (meaning collection animation is running)!
        if (this.gridModel && this.gridModel.lockedTiers && this.gridModel.lockedTiers.some(locked => locked)) {
            console.log(`ShelfRotator: 🔒 Collection animation active! Cannot rotate.`);
            this._activeTier = -1;
            return;
        }

        // ─── Check if previously touched tier has a non-matching stack at index 0 ───
        if (this._lastActiveTier >= 0 && this._lastActiveTier !== selectedTier && this.gridModel) {
            if (this.gridModel.hasNonMatchingStackAtIndex0(this._lastActiveTier)) {
                // Use the true original angle (from registry), not the last-drag start angle
                const resetAngle = this._originalShelfAngles.get(this._lastActiveTier) ?? 0;
                console.log(`ShelfRotator: 🔄 Auto-rotating tier ${this._lastActiveTier} back to original angle ${resetAngle.toFixed(1)}°...`);
                this.autoRotateTierBack(this._lastActiveTier, resetAngle);
                // Clear it so we don't auto-rotate it again unnecessarily
                this._lastActiveTier = -1;
            }
        }

        this._activeTier = selectedTier;

        // ─── NEW: Check if the selected tier is locked by collection height ───
        if (this._activeTier >= 0 && this.gridModel && this.gridModel.shouldTierBeLocked(this._activeTier)) {
            console.log(`ShelfRotator: 🔒 Tier ${this._activeTier} locked by collection height!`);
            this.triggerBumpFeedback(this._activeTier);
            this._activeTier = -1;
            return;
        }

        if (this._activeTier >= 0 && this.shelfNodes[this._activeTier]) {
            this._angleAtDragStart = this.shelfNodes[this._activeTier].eulerAngles.y;

            // ─── Record the TRUE starting angle the very first time this shelf
            //     is ever touched. Never overwrite it on subsequent touches.
            if (!this._originalShelfAngles.has(this._activeTier)) {
                this._originalShelfAngles.set(this._activeTier, this._angleAtDragStart);
                console.log(`ShelfRotator: 📌 Recorded original angle for tier ${this._activeTier}: ${this._angleAtDragStart.toFixed(1)}°`);
            }
        } else {
            console.warn(`ShelfRotator: Could not determine valid tier for screenY ${pos.y}. shelfNodes length is ${this.shelfNodes.length}`);
            this._activeTier = -1;
        }

        this._state = RotatorState.IDLE;
        console.log(`ShelfRotator: TOUCH_START at (${pos.x}, ${pos.y}) -> Active Tier: ${this._activeTier}`);
    }

    private onTouchMove(event: EventTouch) {
        if (this._state === RotatorState.SNAPPING) return;
        if (this._activeTier < 0) return;

        const pos = event.touch!.getLocation();
        const deltaX = pos.x - this._lastTouchPos.x;
        this._totalDragDelta += Math.abs(deltaX);
        this._lastDeltaX = deltaX;

        if (this._totalDragDelta > this.dragThreshold) {
            this._state = RotatorState.DRAGGING;
            this._gestureWasDrag = true;
        }

        if (this._state === RotatorState.DRAGGING) {
            const shelf = this.shelfNodes[this._activeTier];
            const angles = shelf.eulerAngles;
            shelf.setRotationFromEuler(
                angles.x,
                angles.y + deltaX * this.rotationSpeed,
                angles.z
            );
            // console.log(`ShelfRotator: Rotating tier ${this._activeTier} by delta ${deltaX}`);
        }

        this._lastTouchPos.set(pos.x, pos.y);
    }

    private onTouchEnd(_event: EventTouch) {
        console.log(`ShelfRotator: TOUCH_END -> State: ${this._state}, Active Tier: ${this._activeTier}`);
        if (this._state !== RotatorState.DRAGGING || this._activeTier < 0) {
            this._state = RotatorState.IDLE;
            return;
        }

        this._state = RotatorState.SNAPPING;
        this.snapShelf(this._activeTier);
    }

    // ─── Core Logic ──────────────────────────────────────────────────

    /**
     * Picks which tier the player touched using precise 3D raycasting.
     * Returns -1 if the player touches empty space outside the shelves.
     */
    private pickTierFromTouch(screenX: number, screenY: number): number {
        if (this.shelfNodes.length === 0) return -1;

        const camera = this.resolveMainCamera();
        if (camera) {
            camera.screenPointToRay(screenX, screenY, this._ray);
            PhysicsSystem.instance.syncSceneToPhysics();

            if (PhysicsSystem.instance.raycast(this._ray, 0xffffffff, 100)) {
                const results = PhysicsSystem.instance.raycastResults;
                results.sort((a, b) => a.distance - b.distance);
                const closestHit = results[0];

                // Walk up node tree to see which shelf we hit
                let current: Node | null = closestHit.collider.node;
                while (current) {
                    const tierIndex = this.shelfNodes.indexOf(current);
                    if (tierIndex !== -1) {
                        return tierIndex; // Pixel-perfect hit
                    }
                    current = current.parent;
                }
            }
        }

        return -1; // Clicked on nothing or something not in a shelf
    }

    private resolveMainCamera(): Camera | null {
        if (this.mainCamera) {
            return this.mainCamera;
        }

        const scene = director.getScene();
        this.mainCamera = scene?.getComponentInChildren(Camera) ?? null;
        return this.mainCamera;
    }

    /**
     * Calculates the snap target and tweens the shelf to it.
     *
     * TEACHING NOTE — State Pattern in action:
     * The state transitions here prevent the player from touching anything
     * mid-snap. SNAPPING → IDLE only happens inside the tween callback,
     * ensuring the transition is atomic.
     */
    private snapShelf(tier: number) {
        const shelf = this.shelfNodes[tier];
        const intervalDeg = 360 / this.slotsPerTier;
        const currentAngle = shelf.eulerAngles.y;

        // Velocity in deg/pixel (approximation using last frame delta)
        const velocityDeg = this._lastDeltaX * this.rotationSpeed;

        const targetAngle = this.snapStrategy.calculate(currentAngle, intervalDeg, velocityDeg);

        // How many steps did this snap move?
        const prevSnapAngle = Math.round(this._angleAtDragStart / intervalDeg) * intervalDeg;
        const stepsDelta = Math.round((targetAngle - prevSnapAngle) / intervalDeg);

        tween(shelf)
            .to(
                this.snapDuration,
                { eulerAngles: new Vec3(shelf.eulerAngles.x, targetAngle, shelf.eulerAngles.z) },
                { easing: this.snapEasing as any }
            )
            .call(() => {
                // Update the model's offset record
                if (this.gridModel) {
                    this.gridModel.updateShelfOffset(tier, stepsDelta);
                }

                // ── Observer Pattern: emit event so listeners can react ──
                const payload: ShelfSnappedPayload = { tier, snappedAngle: targetAngle, stepsDelta };

                // Emit via node for backward compatibility with AlignmentChecker
                this.node.emit(SHELF_EVENTS.SHELF_SNAPPED, payload);

                // Also emit via EventBus for new centralized event system
                EventBus.emit(GameEvents.SHELF_SNAPPED, payload);

                console.log(
                    `ShelfRotator: ✅ Tier ${tier} snapped to ${targetAngle.toFixed(1)}° ` +
                    `(${stepsDelta} steps)`
                );

                this._state = RotatorState.IDLE;
                this._lastActiveTier = this._activeTier;
                this._activeTier = -1;
            })
            .start();
    }

    /**
     * Play a bump animation when the player tries to rotate a locked tier.
     * Subtle bounce-back effect communicates "this shelf is locked".
     */
    private triggerBumpFeedback(tier: number) {
        const shelf = this.shelfNodes[tier];
        if (!shelf) return;

        const originalEuler = shelf.eulerAngles.clone();

        tween(shelf)
            .to(0.05, { eulerAngles: new Vec3(originalEuler.x, originalEuler.y + 5, originalEuler.z) })
            .to(0.1, { eulerAngles: originalEuler })
            .start();

        console.log(`ShelfRotator: 🔄 Bump feedback on tier ${tier}`);
    }

    /**
     * Auto-rotate a tier back to its starting rotation.
     * Used when the player leaves a non-matching stack at the collection point.
     */
    private autoRotateTierBack(tier: number, targetAngle: number) {
        const shelf = this.shelfNodes[tier];
        if (!shelf || !this.gridModel) return;

        const intervalDeg = 360 / this.slotsPerTier;
        const currentAngle = shelf.eulerAngles.y;

        tween(shelf)
            .to(this.snapDuration, {
                eulerAngles: new Vec3(shelf.eulerAngles.x, targetAngle, shelf.eulerAngles.z)
            }, { easing: this.snapEasing as any })
            .call(() => {
                // Update the model's offset record
                const prevSnapAngle = Math.round(currentAngle / intervalDeg) * intervalDeg;
                const stepsDelta = Math.round((targetAngle - prevSnapAngle) / intervalDeg);
                this.gridModel!.updateShelfOffset(tier, stepsDelta);

                const payload: ShelfSnappedPayload = { tier, snappedAngle: targetAngle, stepsDelta };
                this.node.emit(SHELF_EVENTS.SHELF_SNAPPED, payload);
                EventBus.emit(GameEvents.SHELF_SNAPPED, payload);

                console.log(`ShelfRotator: 🔄 Auto-rotated tier ${tier} back to start angle ${targetAngle}`);
                if (this._activeTier === -1) {
                    this._state = RotatorState.IDLE;
                }
            })
            .start();
    }

}
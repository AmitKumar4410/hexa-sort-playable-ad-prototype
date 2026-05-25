
type Handler<T = any> = (data?: T) => void;

interface BoundEntry<T = any> {
    original: Handler<T>;
    bound: Handler<T>;
    context: any;
}

class EventBusImpl {
    private _listeners: Map<string, BoundEntry[]> = new Map();

    /**
     * Subscribe to an event.
     * @param event  Event key (use UIEvents constants)
     * @param handler  Callback function
     * @param context  `this` context for the callback
     */
    on<T = any>(event: string, handler: Handler<T>, context?: any): void {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        // Avoid duplicate subscriptions from the same context
        const existing = this._listeners.get(event)!;
        const alreadyRegistered = existing.some(
            e => e.original === handler && e.context === context
        );
        if (alreadyRegistered) return;

        const bound = context ? handler.bind(context) : handler;
        existing.push({ original: handler, bound, context });
    }

    /**
     * Unsubscribe from an event.
     */
    off<T = any>(event: string, handler: Handler<T>, context?: any): void {
        const list = this._listeners.get(event);
        if (!list) return;
        const idx = list.findIndex(e => e.original === handler && e.context === context);
        if (idx !== -1) list.splice(idx, 1);
    }

    /**
     * Emit an event, calling all registered handlers.
     */
    emit<T = any>(event: string, data?: T): void {
        const list = this._listeners.get(event);
        if (!list || list.length === 0) return;
        // Snapshot to avoid mutation issues during iteration
        [...list].forEach(entry => {
            try {
                entry.bound(data);
            } catch (e) {
                console.error(`[EventBus] Error in handler for "${event}":`, e);
            }
        });
    }

    /**
     * Subscribe to an event exactly once — auto-unsubscribes after first call.
     */
    once<T = any>(event: string, handler: Handler<T>, context?: any): void {
        const wrapper: Handler<T> = (data?: T) => {
            handler.call(context, data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /**
     * Remove all listeners for a specific event, or all events if none specified.
     */
    clear(event?: string): void {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }

    /**
     * Returns how many listeners are registered for an event (useful for debugging).
     */
    listenerCount(event: string): number {
        return this._listeners.get(event)?.length ?? 0;
    }
}

export const EventBus = new EventBusImpl();

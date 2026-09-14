import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { subscribeGlobal } from "@/api/sse";
import type { GlobalRunEvent } from "@/api/types";

type Listener = (e: GlobalRunEvent) => void;
type EventsApi = {
	subscribe: (fn: Listener) => () => void;
	connected: boolean;
};

const EventsContext = createContext<EventsApi | null>(null);

/** One global EventSource for the whole app; pages subscribe to run status changes. */
export function EventsProvider({ children }: { children: ReactNode }) {
	const listeners = useRef(new Set<Listener>());
	const [connected, setConnected] = useState(true);

	useEffect(() => {
		const close = subscribeGlobal(
			(e) => {
				setConnected(true);
				for (const fn of listeners.current) fn(e);
			},
			() => setConnected(false),
		);
		return close;
	}, []);

	const subscribe = useCallback((fn: Listener) => {
		listeners.current.add(fn);
		return () => {
			listeners.current.delete(fn);
		};
	}, []);

	return <EventsContext.Provider value={{ subscribe, connected }}>{children}</EventsContext.Provider>;
}

export function useRunEvents(fn: Listener | null) {
	const ctx = useContext(EventsContext);
	const ref = useRef(fn);
	ref.current = fn;
	useEffect(() => {
		if (!ctx) return;
		return ctx.subscribe((e) => ref.current?.(e));
	}, [ctx]);
	return ctx?.connected ?? false;
}

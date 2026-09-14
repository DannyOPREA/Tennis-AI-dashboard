import { api } from "./client";
import type { GlobalRunEvent, RunDeltaEvent, RunDoneEvent, RunErrorEvent, RunStatusEvent } from "./types";

function parse<T>(ev: MessageEvent): T | null {
	try {
		return JSON.parse(ev.data) as T;
	} catch {
		return null;
	}
}

export type RunEventHandlers = {
	onStatus?: (e: RunStatusEvent) => void;
	onDelta?: (e: RunDeltaEvent) => void;
	onDone?: (e: RunDoneEvent) => void;
	onError?: (e: RunErrorEvent) => void;
	/** Transport-level failure (connection dropped). */
	onConnectionError?: () => void;
};

/** Subscribe to one run's stream. Returns a function that closes the connection. */
export function subscribeRun(runId: number, h: RunEventHandlers): () => void {
	const es = new EventSource(api.runs.eventsUrl(runId));
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		es.close();
	};
	es.addEventListener("status", (ev) => {
		const d = parse<RunStatusEvent>(ev as MessageEvent);
		if (d) h.onStatus?.(d);
	});
	es.addEventListener("delta", (ev) => {
		const d = parse<RunDeltaEvent>(ev as MessageEvent);
		if (d) h.onDelta?.(d);
	});
	es.addEventListener("done", (ev) => {
		const d = parse<RunDoneEvent>(ev as MessageEvent);
		if (d) h.onDone?.(d);
		close();
	});
	es.addEventListener("error", (ev) => {
		// Both a server "error" event (has data) and a transport error land here.
		const me = ev as MessageEvent;
		if (typeof me.data === "string") {
			const d = parse<RunErrorEvent>(me);
			if (d) h.onError?.(d);
			close();
			return;
		}
		if (es.readyState === EventSource.CLOSED) {
			h.onConnectionError?.();
			close();
		}
	});
	return close;
}

/** Subscribe to the global stream of run status changes. Reconnects automatically (EventSource default). */
export function subscribeGlobal(onRun: (e: GlobalRunEvent) => void, onConnectionError?: () => void): () => void {
	const es = new EventSource(api.globalEventsUrl());
	es.addEventListener("run", (ev) => {
		const d = parse<GlobalRunEvent>(ev as MessageEvent);
		if (d) onRun(d);
	});
	es.onerror = () => {
		if (es.readyState === EventSource.CLOSED) onConnectionError?.();
	};
	return () => es.close();
}

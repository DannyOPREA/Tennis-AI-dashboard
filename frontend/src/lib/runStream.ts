import { useEffect, useRef, useState } from "react";
import { subscribeRun } from "@/api/sse";
import type { Run, RunStatus } from "@/api/types";

export type StreamState = {
	text: string;
	stage: string | null;
	status: RunStatus | null;
	error: string | null;
};

/**
 * Keeps one EventSource per active run id and accumulates partial text.
 * `onDone` receives the final Run so the caller can replace it in its list.
 */
export function useRunStreams(
	activeIds: number[],
	onDone: (run: Run) => void,
	onError?: (runId: number, message: string) => void,
) {
	const [streams, setStreams] = useState<Record<number, StreamState>>({});
	const subs = useRef(new Map<number, () => void>());
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	const key = activeIds
		.slice()
		.sort((a, b) => a - b)
		.join(",");

	useEffect(() => {
		const wanted = new Set(key ? key.split(",").map(Number) : []);
		// close streams for runs that are no longer active
		for (const [id, close] of subs.current) {
			if (!wanted.has(id)) {
				close();
				subs.current.delete(id);
			}
		}
		// open streams for new active runs
		for (const id of wanted) {
			if (subs.current.has(id)) continue;
			const empty: StreamState = {
				text: "",
				stage: null,
				status: null,
				error: null,
			};
			const patch = (p: Partial<StreamState>) =>
				setStreams((s) => ({
					...s,
					[id]: { ...(s[id] ?? empty), ...p },
				}));
			patch({});
			const close = subscribeRun(id, {
				onStatus: (e) => patch({ status: e.status, stage: e.stage }),
				onDelta: (e) =>
					setStreams((s) => ({
						...s,
						[id]: {
							...(s[id] ?? empty),
							text: (s[id]?.text ?? "") + e.text,
						},
					})),
				onDone: (e) => {
					subs.current.delete(id);
					setStreams((s) => {
						const { [id]: _drop, ...rest } = s;
						return rest;
					});
					onDoneRef.current(e.run);
				},
				onError: (e) => {
					subs.current.delete(id);
					patch({ error: e.message, status: "error" });
					onErrorRef.current?.(id, e.message);
				},
				onConnectionError: () => {
					subs.current.delete(id);
				},
			});
			subs.current.set(id, close);
		}
	}, [key]);

	useEffect(() => {
		const map = subs.current;
		return () => {
			for (const close of map.values()) close();
			map.clear();
		};
	}, []);

	return streams;
}

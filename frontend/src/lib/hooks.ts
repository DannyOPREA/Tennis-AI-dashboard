import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/client";

export type AsyncState<T> = {
	data: T | null;
	error: string | null;
	loading: boolean;
	/** true while a refetch is in flight but old data is still shown */
	refreshing: boolean;
	reload: () => Promise<void>;
	setData: (updater: T | ((prev: T | null) => T | null)) => void;
};

/**
 * Minimal data hook. `deps` change triggers a refetch; the previous data is kept
 * during the refetch so charts and lists don't flash a skeleton.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
	const [data, setDataRaw] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const fnRef = useRef(fn);
	fnRef.current = fn;
	const seq = useRef(0);

	const reload = useCallback(async () => {
		const id = ++seq.current;
		setRefreshing(true);
		try {
			const result = await fnRef.current();
			if (id !== seq.current) return;
			setDataRaw(result);
			setError(null);
		} catch (e) {
			if (id !== seq.current) return;
			setError(errorMessage(e));
		} finally {
			if (id === seq.current) {
				setLoading(false);
				setRefreshing(false);
			}
		}
	}, []);

	// Callers pass plain values / memoised objects; a serialised key keeps the effect honest for the linter.
	const depsKey = JSON.stringify(deps);
	// biome-ignore lint/correctness/useExhaustiveDependencies: depsKey re-runs the fetch when the caller's deps change
	useEffect(() => {
		setLoading(true);
		void reload();
	}, [reload, depsKey]);

	const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
		setDataRaw((prev) => (typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater));
	}, []);

	return { data, error, loading, refreshing, reload, setData };
}

export function useDebounced<T>(value: T, ms: number): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const id = window.setTimeout(() => setV(value), ms);
		return () => window.clearTimeout(id);
	}, [value, ms]);
	return v;
}

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() =>
		typeof window !== "undefined" ? window.matchMedia(query).matches : false,
	);
	useEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		mql.addEventListener("change", onChange);
		setMatches(mql.matches);
		return () => mql.removeEventListener("change", onChange);
	}, [query]);
	return matches;
}

export function useDocumentTitle(title: string) {
	useEffect(() => {
		const prev = document.title;
		document.title = title;
		return () => {
			document.title = prev;
		};
	}, [title]);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/api/client";
import type { ModelConfig, OllamaStatus, PullJob } from "@/api/types";
import { useToast } from "@/components/toast";
import { t } from "@/i18n";
import { useAsync } from "@/lib/hooks";

export type LocalModelState =
	| { kind: "pulling"; job: PullJob }
	| { kind: "installed"; size_bytes: number | null }
	| { kind: "absent"; lastJob: PullJob | null };

export type OllamaManager = {
	status: OllamaStatus | null;
	statusError: string | null;
	statusLoading: boolean;
	models: ModelConfig[];
	modelsError: string | null;
	modelsLoading: boolean;
	pulls: PullJob[];
	anyPulling: boolean;
	refreshing: boolean;
	stateOf: (model: ModelConfig) => LocalModelState;
	/** true while a request for this model (pull/cancel/remove) is in flight */
	busy: (modelConfigId: string) => boolean;
	pull: (modelConfigId: string) => Promise<void>;
	cancel: (modelConfigId: string) => Promise<void>;
	remove: (modelConfigId: string) => Promise<void>;
	reload: () => Promise<void>;
};

const POLL_MS = 1000;

/**
 * Ollama status, the registry's local models and download jobs, with 1 s polling
 * while any pull is running. Shared by the Settings and Welcome pages.
 */
export function useOllama(): OllamaManager {
	const toast = useToast();
	const status = useAsync(() => api.ollama.status(), []);
	const models = useAsync(() => api.models.list(), []);
	const [pulls, setPulls] = useState<PullJob[]>([]);
	const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
	const pullingBefore = useRef<Set<string>>(new Set());
	const { reload: reloadStatus } = status;
	const { reload: reloadModels } = models;

	const setBusy = useCallback((id: string, on: boolean) => {
		setBusyIds((prev) => {
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);

	const refreshPulls = useCallback(async () => {
		let jobs: PullJob[];
		try {
			jobs = await api.ollama.pulls();
		} catch {
			return; // transient; the next tick retries
		}
		setPulls(jobs);
		const nowPulling = new Set(jobs.filter((j) => j.status === "pulling").map((j) => j.model_config_id));
		let finished = false;
		for (const id of pullingBefore.current) if (!nowPulling.has(id)) finished = true;
		pullingBefore.current = nowPulling;
		if (finished) {
			// A download ended: the installed list and model availability changed.
			void reloadStatus();
			void reloadModels();
		}
	}, [reloadStatus, reloadModels]);

	const anyPulling = pulls.some((j) => j.status === "pulling");

	useEffect(() => {
		void refreshPulls();
	}, [refreshPulls]);

	useEffect(() => {
		if (!anyPulling) return;
		const id = window.setInterval(() => void refreshPulls(), POLL_MS);
		return () => window.clearInterval(id);
	}, [anyPulling, refreshPulls]);

	const reload = useCallback(async () => {
		await Promise.all([reloadStatus(), reloadModels(), refreshPulls()]);
	}, [reloadStatus, reloadModels, refreshPulls]);

	const pull = useCallback(
		async (id: string) => {
			setBusy(id, true);
			try {
				const job = await api.ollama.pull(id);
				setPulls((prev) => [...prev.filter((j) => j.model_config_id !== id), job]);
				if (job.status === "pulling") pullingBefore.current.add(id);
				void reloadModels();
			} catch (e) {
				toast.error(errorMessage(e));
			} finally {
				setBusy(id, false);
			}
		},
		[setBusy, reloadModels, toast],
	);

	const cancel = useCallback(
		async (id: string) => {
			setBusy(id, true);
			try {
				await api.ollama.cancelPull(id);
				toast.toast(t.toast.pullCancelled);
				await refreshPulls();
			} catch (e) {
				toast.error(errorMessage(e));
			} finally {
				setBusy(id, false);
			}
		},
		[setBusy, refreshPulls, toast],
	);

	const remove = useCallback(
		async (id: string) => {
			setBusy(id, true);
			try {
				await api.ollama.removeModel(id);
				toast.success(t.toast.modelRemoved);
				await Promise.all([reloadStatus(), reloadModels()]);
			} catch (e) {
				toast.error(errorMessage(e));
			} finally {
				setBusy(id, false);
			}
		},
		[setBusy, reloadStatus, reloadModels, toast],
	);

	const localModels = useMemo(() => (models.data ?? []).filter((m) => m.provider === "ollama"), [models.data]);

	const installed = useMemo(() => {
		const map = new Map<string, number>();
		for (const m of status.data?.installed ?? []) if (m.model_config_id) map.set(m.model_config_id, m.size_bytes);
		return map;
	}, [status.data]);

	const stateOf = useCallback(
		(model: ModelConfig): LocalModelState => {
			const job = pulls.find((j) => j.model_config_id === model.id) ?? null;
			if (job?.status === "pulling") return { kind: "pulling", job };
			if (installed.has(model.id)) return { kind: "installed", size_bytes: installed.get(model.id) ?? null };
			// Fallback for a backend that reports availability but no installed list yet.
			if (!status.data && model.availability.available) return { kind: "installed", size_bytes: null };
			return { kind: "absent", lastJob: job };
		},
		[pulls, installed, status.data],
	);

	const busy = useCallback((id: string) => busyIds.has(id), [busyIds]);

	return {
		status: status.data,
		statusError: status.error,
		statusLoading: status.loading,
		models: localModels,
		modelsError: models.error,
		modelsLoading: models.loading,
		pulls,
		anyPulling,
		refreshing: status.refreshing || models.refreshing,
		stateOf,
		busy,
		pull,
		cancel,
		remove,
		reload,
	};
}

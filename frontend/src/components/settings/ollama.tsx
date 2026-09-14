import { CheckIcon, DownloadIcon, HardDriveIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import type { ModelConfig, PullJob } from "@/api/types";
import { Tag } from "@/components/common/chips";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { fmtBytes, fmtNum } from "@/lib/format";
import type { OllamaManager } from "@/lib/ollama";
import { cn } from "@/lib/utils";

const DISK_LOW_GB = 10;

/** Reachable / not running card with disk space and a Refresh button. */
export function OllamaStatusCard({ manager, className }: { manager: OllamaManager; className?: string }) {
	const { status, statusError, statusLoading, refreshing, reload } = manager;

	if (statusLoading && !status) {
		return (
			<div className={cn("rounded-xl border bg-card p-4", className)} aria-busy>
				<Skeleton className="h-4 w-48" />
				<Skeleton className="mt-2 h-3 w-64" />
			</div>
		);
	}
	if (statusError && !status) {
		return <ErrorState message={statusError} onRetry={() => void reload()} className={className} />;
	}
	if (!status) return null;

	const diskLow = status.disk_free_gb !== null && status.disk_free_gb < DISK_LOW_GB;
	const dotColor = status.reachable ? "var(--status-done)" : "var(--status-error)";

	return (
		<div className={cn("rounded-xl border bg-card p-4", className)} role="status">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="flex items-center gap-2 text-sm font-medium">
						<span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dotColor }} />
						{status.reachable ? t.settings.ollama.running(status.version) : t.settings.ollama.notRunning}
					</p>
					{!status.reachable ? (
						<p className="mt-1 text-sm text-muted-foreground">{t.settings.ollama.notRunningHint}</p>
					) : null}
					{status.disk_free_gb !== null ? (
						<p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
							<HardDriveIcon aria-hidden className="size-3.5" />
							{t.settings.ollama.diskFree(`${fmtNum(status.disk_free_gb, 1)} GB`)}
						</p>
					) : null}
				</div>
				<Button size="sm" variant="outline" onClick={() => void reload()} disabled={refreshing}>
					<RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
					{refreshing ? t.settings.ollama.refreshing : t.settings.ollama.refresh}
				</Button>
			</div>
			{diskLow ? (
				<p className="mt-3 flex items-start gap-1.5 text-xs text-status-interrupted">
					<TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
					{t.settings.ollama.diskLow}
				</p>
			) : null}
		</div>
	);
}

/** The registry's Ollama rows with Installed / Download / progress per row. */
export function LocalModelList({
	manager,
	models,
	allowRemove,
	className,
}: {
	manager: OllamaManager;
	/** Defaults to every registry row with provider `ollama`. */
	models?: ModelConfig[];
	allowRemove?: boolean;
	className?: string;
}) {
	const rows = models ?? manager.models;
	const reachable = manager.status?.reachable ?? false;

	if (manager.modelsLoading && rows.length === 0) {
		return (
			<ul className={cn("divide-y rounded-xl border bg-card", className)} aria-busy>
				{[0, 1, 2].map((i) => (
					<li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-24" />
						</div>
						<Skeleton className="h-7 w-24" />
					</li>
				))}
			</ul>
		);
	}
	if (manager.modelsError && rows.length === 0) {
		return <ErrorState message={manager.modelsError} onRetry={() => void manager.reload()} className={className} />;
	}
	if (rows.length === 0) {
		return <EmptyState title={t.settings.ollama.noModels} className={className} />;
	}

	return (
		<ul className={cn("divide-y rounded-xl border bg-card", className)}>
			{rows.map((m) => (
				<ModelRow key={m.id} model={m} manager={manager} reachable={reachable} allowRemove={allowRemove ?? false} />
			))}
		</ul>
	);
}

function ModelRow({
	model,
	manager,
	reachable,
	allowRemove,
}: {
	model: ModelConfig;
	manager: OllamaManager;
	reachable: boolean;
	allowRemove: boolean;
}) {
	const state = manager.stateOf(model);
	const busy = manager.busy(model.id);

	return (
		<li className="px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="min-w-0 flex-1 basis-48">
					<p className="flex flex-wrap items-center gap-2 text-sm font-medium">
						<span className="truncate">{model.display_name}</span>
						<Tag>{model.model_id}</Tag>
					</p>
					<p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
						{model.vram_note ? <span>{model.vram_note}</span> : null}
						{state.kind === "installed" && state.size_bytes ? (
							<span>{t.settings.ollama.installedSize(fmtBytes(state.size_bytes))}</span>
						) : null}
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{state.kind === "installed" ? (
						<>
							<InstalledChip />
							{allowRemove ? (
								<Button
									size="sm"
									variant="ghost"
									disabled={busy}
									onClick={() => {
										if (window.confirm(t.settings.ollama.removeConfirm(model.display_name)))
											void manager.remove(model.id);
									}}
								>
									{t.settings.ollama.remove}
								</Button>
							) : null}
						</>
					) : null}
					{state.kind === "pulling" ? (
						<Button size="sm" variant="outline" disabled={busy} onClick={() => void manager.cancel(model.id)}>
							{busy ? t.settings.ollama.cancelling : t.settings.ollama.cancel}
						</Button>
					) : null}
					{state.kind === "absent" ? (
						<Button
							size="sm"
							variant={reachable ? "default" : "outline"}
							disabled={busy || !reachable}
							title={reachable ? undefined : t.settings.ollama.needsOllama}
							onClick={() => void manager.pull(model.id)}
						>
							<DownloadIcon data-icon="inline-start" />
							{t.settings.ollama.download}
						</Button>
					) : null}
				</div>
			</div>

			{state.kind === "pulling" ? <PullProgress job={state.job} /> : null}
			{state.kind === "absent" && state.lastJob?.status === "error" ? (
				<p role="alert" className="mt-2 text-xs text-destructive">
					{t.settings.ollama.pullError}: {state.lastJob.message}
				</p>
			) : null}
			{state.kind === "absent" && state.lastJob?.status === "cancelled" ? (
				<p className="mt-2 text-xs text-muted-foreground">{t.settings.ollama.pullCancelled}</p>
			) : null}
		</li>
	);
}

function PullProgress({ job }: { job: PullJob }) {
	const pct = job.percent ?? (job.total_bytes ? (job.completed_bytes / job.total_bytes) * 100 : null);
	const label =
		pct === null
			? t.settings.ollama.starting
			: `${Math.round(pct)}%${job.total_bytes ? `, ${t.settings.ollama.progress(fmtBytes(job.completed_bytes), fmtBytes(job.total_bytes))}` : ""}`;
	return (
		<div className="mt-2 flex items-center gap-3 text-xs" aria-live="polite">
			<span className="shrink-0 text-muted-foreground">{t.settings.ollama.downloading}</span>
			<Progress value={pct} className="max-w-72 flex-1" aria-label={`${t.settings.ollama.downloading} ${job.tag}`} />
			<span className="tabular shrink-0 text-muted-foreground">{label}</span>
		</div>
	);
}

export function InstalledChip() {
	const color = "var(--status-done)";
	return (
		<span
			className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap"
			style={{ color, borderColor: `color-mix(in oklch, ${color} 35%, transparent)` }}
		>
			<CheckIcon aria-hidden className="size-3" />
			{t.settings.ollama.installed}
		</span>
	);
}

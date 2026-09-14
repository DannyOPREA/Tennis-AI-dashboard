import { ArrowLeftIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, WifiOffIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "@/api/client";
import type { Batch, Run } from "@/api/types";
import { ModeChip, ModelChip, StatusChip } from "@/components/common/chips";
import { MetricsStrip } from "@/components/common/metrics";
import { MarkdownOutput } from "@/components/common/output";
import { RatingWidget } from "@/components/common/rating";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useRunEvents } from "@/lib/events";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { canRetry, isActive, isLocalProvider } from "@/lib/providers";
import { useRunStreams } from "@/lib/runStream";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const blindLetter = (i: number) =>
	LETTERS[i % LETTERS.length] + (i >= LETTERS.length ? String(Math.floor(i / LETTERS.length) + 1) : "");

export function ComparePage() {
	const { id } = useParams();
	const batchId = Number(id);
	const toast = useToast();
	const batch = useAsync(() => api.batches.get(batchId), [batchId]);
	useDocumentTitle(`${t.compare.batch(batchId)} – ${t.app.name}`);
	const [revealAll, setRevealAll] = useState(false);
	const { reload: reloadBatch, setData: setBatch } = batch;

	// Refetch the batch (debounced) whenever any of its runs changes status.
	const timer = useRef<number | null>(null);
	const connected = useRunEvents(
		useCallback(
			(e) => {
				if (e.batch_id !== batchId) return;
				if (timer.current) window.clearTimeout(timer.current);
				timer.current = window.setTimeout(() => void reloadBatch(), 250);
			},
			[batchId, reloadBatch],
		),
	);
	useEffect(
		() => () => {
			if (timer.current) window.clearTimeout(timer.current);
		},
		[],
	);

	const runs = useMemo(() => batch.data?.runs ?? [], [batch.data]);
	const activeIds = useMemo(() => runs.filter((r) => isActive(r.status)).map((r) => r.id), [runs]);
	const replaceRun = useCallback(
		(run: Run) => setBatch((b) => (b ? { ...b, runs: b.runs.map((r) => (r.id === run.id ? run : r)) } : b)),
		[setBatch],
	);
	const streams = useRunStreams(activeIds, replaceRun);

	async function cancel(run: Run) {
		try {
			replaceRun(await api.runs.cancel(run.id));
			toast.toast(t.toast.runCancelled);
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}
	async function retry(run: Run) {
		try {
			const fresh = await api.runs.retry(run.id);
			batch.setData((b) => (b ? { ...b, runs: [...b.runs, fresh], run_count: b.run_count + 1 } : b));
			toast.toast(t.toast.runRetried);
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	const b: Batch | null = batch.data;

	return (
		<>
			<PageHeader
				eyebrow={
					<Link to="/batches" className="inline-flex items-center gap-1 hover:text-foreground">
						<ArrowLeftIcon aria-hidden className="size-3.5" />
						{t.nav.batches}
					</Link>
				}
				title={b ? b.name || t.compare.batch(b.id) : t.compare.batch(batchId)}
				description={
					b ? (
						<span className="flex flex-wrap gap-x-4 gap-y-0.5">
							<span>
								{t.compare.video}: <span className="text-foreground">{b.video_title}</span>
							</span>
							<span>
								{t.compare.prompt}: <span className="text-foreground">{b.prompt_name}</span>{" "}
								{t.prompts.version(b.prompt_version).toLowerCase()}
							</span>
							<span>
								{t.compare.preset}: <span className="text-foreground">{b.frame_preset}</span>
							</span>
							{b.repeats > 1 ? (
								<span>
									{t.compare.repeats}: <span className="text-foreground">{b.repeats}</span>
								</span>
							) : null}
						</span>
					) : null
				}
				actions={
					<>
						{!connected ? (
							<span className="inline-flex items-center gap-1.5 text-xs text-status-interrupted">
								<WifiOffIcon aria-hidden className="size-3.5" />
								{t.compare.liveOff}
							</span>
						) : null}
						{b?.blind ? (
							<Button variant="outline" size="sm" onClick={() => setRevealAll((v) => !v)} aria-pressed={revealAll}>
								{revealAll ? <EyeOffIcon data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
								{revealAll ? t.compare.hideAll : t.compare.revealAll}
							</Button>
						) : null}
						{b ? (
							<Button variant="outline" size="sm" render={<a href={api.batches.exportUrl(b.id)} download />}>
								<DownloadIcon data-icon="inline-start" />
								{t.compare.exportBatch}
							</Button>
						) : null}
					</>
				}
			/>

			{batch.error && !b ? <ErrorState message={batch.error} onRetry={() => void batch.reload()} /> : null}
			{batch.loading && !b ? <ListSkeleton rows={6} /> : null}
			{b && runs.length === 0 ? <EmptyState title={t.compare.empty} /> : null}

			{b && runs.length > 0 ? (
				<div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
					<div className="grid gap-4 sm:grid-flow-col sm:auto-cols-[minmax(320px,1fr)]" style={{ minWidth: 0 }}>
						{runs.map((run, i) => {
							const revealed = !b.blind || revealAll || run.rating !== null;
							return (
								<RunColumn
									key={run.id}
									run={run}
									index={i}
									revealed={revealed}
									stream={streams[run.id]}
									onCancel={() => void cancel(run)}
									onRetry={() => void retry(run)}
									onRated={(rating) => replaceRun({ ...run, rating })}
								/>
							);
						})}
					</div>
					{runs.length > 3 ? (
						<p className="mt-2 text-xs text-muted-foreground sm:hidden">{t.compare.scrollHint}</p>
					) : null}
				</div>
			) : null}
		</>
	);
}

function RunColumn({
	run,
	index,
	revealed,
	stream,
	onCancel,
	onRetry,
	onRated,
}: {
	run: Run;
	index: number;
	revealed: boolean;
	stream?: {
		text: string;
		stage: string | null;
		status: string | null;
		error: string | null;
	};
	onCancel: () => void;
	onRetry: () => void;
	onRated: (rating: Run["rating"]) => void;
}) {
	const active = isActive(run.status);
	const text = run.output_text ?? stream?.text ?? "";
	const stage = stream?.stage ?? run.stage;
	const local = isLocalProvider(run.provider);

	return (
		<article
			className="flex min-w-0 flex-col rounded-xl border bg-card"
			aria-label={revealed ? run.model_label : t.compare.hiddenModel(blindLetter(index))}
		>
			<header className="space-y-3 border-b p-3">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 space-y-1">
						<ModelChip
							provider={run.provider}
							label={<span className="font-heading text-sm">{run.model_label}</span>}
							hidden={!revealed}
							hiddenLabel={t.compare.hiddenModel(blindLetter(index))}
							size="lg"
						/>
						<div className="flex flex-wrap items-center gap-1.5 pl-1 text-xs text-muted-foreground">
							<ModeChip mode={run.input_mode} />
							{run.repeat_index > 0 ? <span>{t.compare.repeat(run.repeat_index + 1)}</span> : null}
							{!revealed ? <span>{t.compare.hiddenHint}</span> : null}
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t.compare.openRun}
						render={<Link to={`/runs/${run.id}`} />}
					>
						<ExternalLinkIcon />
					</Button>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<StatusChip status={run.status} stage={stage} />
					<div className="flex gap-1">
						{active ? (
							<Button variant="ghost" size="xs" onClick={onCancel}>
								{t.compare.cancelRun}
							</Button>
						) : null}
						{canRetry(run.status) ? (
							<Button variant="outline" size="xs" onClick={onRetry}>
								{t.compare.retryRun}
							</Button>
						) : null}
					</div>
				</div>
				{run.error ? (
					<p role="alert" className="rounded-md bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive">
						{run.error}
					</p>
				) : null}
				{run.status === "done" ? <MetricsStrip m={run.metrics} local={revealed && local} /> : null}
			</header>

			<div className={cn("max-h-[60vh] min-h-32 flex-1 overflow-y-auto p-4", active && "bg-card")}>
				{text ? (
					<MarkdownOutput text={text} streaming={active} />
				) : (
					<p className="text-sm text-muted-foreground">{active ? t.compare.waiting : t.compare.noOutput}</p>
				)}
			</div>

			<footer className="border-t p-3">
				<RatingWidget runId={run.id} rating={run.rating} onSaved={onRated} compact />
			</footer>
		</article>
	);
}

import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "@/api/client";
import type { Run, RunMetrics } from "@/api/types";
import { ModeChip, ModelChip, StatusChip } from "@/components/common/chips";
import { Metric, TimingBar, TruncatedNote } from "@/components/common/metrics";
import { Disclosure, JsonPanel, MarkdownOutput } from "@/components/common/output";
import { RatingWidget } from "@/components/common/rating";
import { ErrorState, ListSkeleton, PageHeader, SectionTitle } from "@/components/common/states";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { useRunEvents } from "@/lib/events";
import { fmtClock, fmtDate, fmtInt, fmtMb, fmtMs, fmtNum, fmtUsd } from "@/lib/format";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { canRetry, isActive, isLocalProvider, providerLabel } from "@/lib/providers";
import { useRunStreams } from "@/lib/runStream";

export function RunDetailPage() {
	const { id } = useParams();
	const runId = Number(id);
	const toast = useToast();
	const navigate = useNavigate();
	const run = useAsync(() => api.runs.get(runId), [runId]);
	useDocumentTitle(`${t.run.title(runId)} – ${t.app.name}`);
	const [revealed, setRevealed] = useState(false);
	const { reload: reloadRun } = run;

	useRunEvents(
		useCallback(
			(e) => {
				if (e.run_id === runId) void reloadRun();
			},
			[runId, reloadRun],
		),
	);

	const r = run.data;
	const active = r ? isActive(r.status) : false;
	const activeIds = useMemo(() => (r && active ? [r.id] : []), [r, active]);
	const streams = useRunStreams(activeIds, (fresh) => run.setData(fresh));
	const stream = r ? streams[r.id] : undefined;

	async function cancel() {
		if (!r) return;
		try {
			run.setData(await api.runs.cancel(r.id));
			toast.toast(t.toast.runCancelled);
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}
	async function retry() {
		if (!r) return;
		try {
			const fresh = await api.runs.retry(r.id);
			toast.toast(t.toast.runRetried);
			navigate(`/runs/${fresh.id}`);
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	if (run.error && !r) return <ErrorState message={run.error} onRetry={() => void run.reload()} />;
	if (!r) return <ListSkeleton rows={8} />;

	const hidden = r.blind && r.rating === null && !revealed;
	const text = r.output_text ?? stream?.text ?? "";
	const local = isLocalProvider(r.provider);
	const isNative = r.input_mode === "native_video";

	return (
		<>
			<PageHeader
				eyebrow={
					<Link to={`/batches/${r.batch_id}`} className="inline-flex items-center gap-1 hover:text-foreground">
						<ArrowLeftIcon aria-hidden className="size-3.5" />
						{t.run.backToBatch}
					</Link>
				}
				title={
					<span className="flex flex-wrap items-center gap-3">
						{hidden ? t.run.blindHidden : r.model_label}
						<StatusChip status={r.status} stage={stream?.stage ?? r.stage} />
					</span>
				}
				description={
					<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
						{!hidden ? (
							<ModelChip provider={r.provider} label={providerLabel(r.provider)} />
						) : (
							<span className="text-xs">{t.run.blindHidden}</span>
						)}
						<ModeChip mode={r.input_mode} />
						<span>{r.frame_preset}</span>
						<span>{r.video_title}</span>
						<span>
							{r.prompt_name} v{r.prompt_version}
						</span>
						<span>{r.host}</span>
					</span>
				}
				actions={
					<>
						{r.blind && r.rating === null ? (
							<Button variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
								{revealed ? t.compare.hideAll : t.compare.revealAll}
							</Button>
						) : null}
						{active ? (
							<Button variant="outline" size="sm" onClick={() => void cancel()}>
								{t.compare.cancelRun}
							</Button>
						) : null}
						{canRetry(r.status) ? (
							<Button variant="outline" size="sm" onClick={() => void retry()}>
								{t.compare.retryRun}
							</Button>
						) : null}
					</>
				}
			/>

			{r.error ? <ErrorState message={r.error} className="mb-4" /> : null}

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<div className="space-y-6">
					<section>
						<video
							controls
							preload="metadata"
							poster={api.videos.thumbnailUrl(r.video_id)}
							src={api.videos.fileUrl(r.video_id)}
							className="aspect-video w-full rounded-xl bg-baseline"
						>
							<track kind="captions" />
						</video>
					</section>

					<section>
						<SectionTitle hint={isNative ? t.run.framesNative : undefined}>{t.run.frames}</SectionTitle>
						{!isNative ? <Filmstrip runId={r.id} /> : null}
					</section>

					<section>
						<SectionTitle hint={active ? t.run.streaming : undefined}>{t.run.output}</SectionTitle>
						<div className="rounded-xl border bg-card p-5">
							{text ? (
								<MarkdownOutput text={text} streaming={active} />
							) : (
								<p className="text-sm text-muted-foreground">{active ? t.compare.waiting : t.compare.noOutput}</p>
							)}
						</div>
					</section>

					<section className="space-y-2">
						<JsonPanel title={t.run.rawUsage} value={r.raw_usage} />
						<JsonPanel title={t.run.requestSummary} value={r.request_summary} />
						{!hidden ? <ModelSnapshot run={r} /> : null}
					</section>
				</div>

				<aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
					<section className="rounded-xl border bg-card p-4">
						<SectionTitle>{t.rating.title}</SectionTitle>
						<RatingWidget runId={r.id} rating={r.rating} onSaved={(rating) => run.setData({ ...r, rating })} />
					</section>
					<section className="rounded-xl border bg-card p-4">
						<SectionTitle>{t.metrics.title}</SectionTitle>
						<MetricsPanel m={r.metrics} local={local} run={r} />
					</section>
				</aside>
			</div>
		</>
	);
}

function Filmstrip({ runId }: { runId: number }) {
	const frames = useAsync(() => api.runs.frames(runId), [runId]);
	if (frames.error) return <p className="text-xs text-muted-foreground">{frames.error}</p>;
	if (!frames.data) return <Skeleton className="h-20 w-full" />;
	if (frames.data.count === 0) return <p className="text-sm text-muted-foreground">{t.run.framesEmpty}</p>;
	return (
		<div className="space-y-3">
			{frames.data.contact_sheet_url ? (
				<Disclosure title={`${t.run.contactSheet} (${fmtInt(frames.data.count)})`}>
					<img src={frames.data.contact_sheet_url} alt={t.run.contactSheet} loading="lazy" className="w-full rounded" />
				</Disclosure>
			) : null}
			<ul className="flex gap-1.5 overflow-x-auto pb-1">
				{frames.data.frames.map((f) => (
					<li key={f.index} className="shrink-0">
						<img
							src={f.url}
							alt={t.run.frameAt(fmtClock(f.t))}
							title={t.run.frameAt(fmtClock(f.t))}
							loading="lazy"
							className="h-16 rounded ring-1 ring-border"
						/>
						<div className="tabular mt-0.5 text-center text-[10px] text-muted-foreground">{fmtClock(f.t)}</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function MetricsPanel({ m, local, run }: { m: RunMetrics; local: boolean; run: Run }) {
	const tokenRows = [
		{ label: t.metrics.text, v: m.tokens_in_text },
		{ label: t.metrics.image, v: m.tokens_in_image },
		{ label: t.metrics.videoTok, v: m.tokens_in_video },
		{ label: t.metrics.audio, v: m.tokens_in_audio },
		{ label: t.metrics.cached, v: m.tokens_in_cached },
	].filter((x) => x.v !== null && x.v > 0);
	const tokenMax = Math.max(1, ...tokenRows.map((x) => x.v ?? 0));
	return (
		<div className="space-y-5 text-sm">
			<div>
				<div className="mb-1.5 text-xs text-muted-foreground">{t.metrics.timing}</div>
				<TimingBar m={m} />
				<div className="mt-2 grid grid-cols-2 gap-2">
					<Metric label={t.metrics.ttft} value={fmtMs(m.ttft_ms)} />
					<Metric label={t.metrics.tokensPerSec} value={fmtNum(m.tokens_out_per_s)} />
				</div>
				<div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
					{m.cold_start ? <span>{t.metrics.coldStart}</span> : null}
					{m.cache_hit ? <span>{t.metrics.cacheHit}</span> : null}
				</div>
			</div>

			<div>
				<div className="mb-1.5 text-xs text-muted-foreground">{t.metrics.tokens}</div>
				<div className="grid grid-cols-3 gap-2">
					<Metric label={t.metrics.tokensIn} value={fmtInt(m.tokens_in_total)} />
					<Metric label={t.metrics.tokensOut} value={fmtInt(m.tokens_out)} />
					<Metric label={t.metrics.tokensThinking} value={fmtInt(m.tokens_thinking)} />
				</div>
				{tokenRows.length > 0 ? (
					<ul className="mt-2 space-y-1">
						{tokenRows.map((x) => (
							<li key={x.label} className="grid grid-cols-[56px_1fr_auto] items-center gap-2 text-xs">
								<span className="text-muted-foreground">{x.label}</span>
								<span className="h-1.5 rounded-sm bg-muted">
									<span
										className="block h-full rounded-sm bg-cost-4"
										style={{
											width: `${((x.v ?? 0) / tokenMax) * 100}%`,
											background: "var(--cost-4)",
										}}
									/>
								</span>
								<span className="tabular">{fmtInt(x.v)}</span>
							</li>
						))}
					</ul>
				) : null}
				{m.truncated_suspected ? (
					<div className="mt-2">
						<TruncatedNote />
					</div>
				) : null}
				<div className="mt-2 grid grid-cols-2 gap-2">
					<Metric label={t.metrics.outputWords} value={fmtInt(m.output_words)} />
					<Metric label={t.metrics.outputChars} value={fmtInt(m.output_chars)} />
					{run.input_mode === "frames" ? (
						<Metric label={t.metrics.framesSent} value={fmtInt(m.frames_sent)} />
					) : (
						<Metric label={t.metrics.videoSeconds} value={fmtNum(m.video_seconds_sent)} />
					)}
				</div>
			</div>

			<div>
				<div className="mb-1.5 text-xs text-muted-foreground">{t.metrics.cost}</div>
				<div className="grid grid-cols-2 gap-2">
					<Metric label={t.metrics.apiCost} value={fmtUsd(m.cost_api_usd)} />
					{local ? <Metric label={t.metrics.energyCost} value={fmtUsd(m.cost_energy_usd)} /> : null}
				</div>
			</div>

			{local || m.gpu_seconds !== null || m.model_vram_mb !== null ? (
				<div>
					<div className="mb-1.5 text-xs text-muted-foreground">{t.metrics.gpu}</div>
					<div className="grid grid-cols-2 gap-2">
						<Metric label={t.metrics.vram} value={fmtMb(m.gpu_peak_vram_delta_mb)} />
						<Metric label={t.metrics.modelVram} value={fmtMb(m.model_vram_mb)} />
						<Metric label={t.metrics.gpuSeconds} value={m.gpu_seconds !== null ? `${fmtNum(m.gpu_seconds)} s` : "—"} />
						<Metric
							label={t.metrics.gpuEnergy}
							value={m.gpu_energy_wh !== null ? `${fmtNum(m.gpu_energy_wh, 2)} Wh` : "—"}
						/>
					</div>
				</div>
			) : null}

			<div className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
				<Metric label={t.run.created} value={fmtDate(run.created_at)} />
				<Metric label={t.run.started} value={fmtDate(run.started_at)} />
				<Metric label={t.run.finished} value={fmtDate(run.finished_at)} />
				<Metric label={t.run.retries} value={fmtInt(run.retries)} />
				<Metric label={t.metrics.modelVersion} value={m.model_version ?? "—"} className="col-span-2" />
				{m.sdk_versions ? (
					<Metric
						label={t.metrics.sdk}
						value={Object.entries(m.sdk_versions)
							.map(([k, v]) => `${k} ${v}`)
							.join(", ")}
						className="col-span-2"
					/>
				) : null}
			</div>
		</div>
	);
}

function ModelSnapshot({ run }: { run: Run }) {
	const s = run.model_snapshot;
	const p = s.prices;
	return (
		<Disclosure title={t.run.modelSnapshot}>
			<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
				<dt className="text-muted-foreground">{t.newRun.colModel}</dt>
				<dd>
					{s.display_name} <span className="text-muted-foreground">{s.model_id}</span>
				</dd>
				{s.base_url ? (
					<>
						<dt className="text-muted-foreground">URL</dt>
						<dd className="break-all">{s.base_url}</dd>
					</>
				) : null}
				<dt className="text-muted-foreground">{t.run.prices}</dt>
				<dd className="tabular">
					{`${t.metrics.text} ${fmtNum(p.text_in, 3)}, ${t.metrics.image} ${fmtNum(p.image_in, 3)}, ${t.metrics.videoTok} ${fmtNum(p.video_in, 3)}, ${t.metrics.audio} ${fmtNum(p.audio_in, 3)}, ${t.metrics.cached} ${fmtNum(p.cached_in, 3)}, ${t.metrics.out} ${fmtNum(p.out, 3)}`}
					{p.source_url ? (
						<>
							{" "}
							<a
								href={p.source_url}
								target="_blank"
								rel="noreferrer"
								className="text-terre underline-offset-2 hover:underline"
							>
								{t.run.pricesSource}
							</a>
						</>
					) : null}
				</dd>
				{run.frame_plan ? (
					<>
						<dt className="text-muted-foreground">{t.run.framePlan}</dt>
						<dd>
							{run.frame_plan.label}:{" "}
							{t.newRun.framePresetHint(run.frame_plan.fps, run.frame_plan.long_edge, run.frame_plan.max_frames)}
						</dd>
					</>
				) : null}
				{s.licence ? (
					<>
						<dt className="text-muted-foreground">{t.run.licence}</dt>
						<dd>{s.licence}</dd>
					</>
				) : null}
				{s.vram_note ? (
					<>
						<dt className="text-muted-foreground">{t.run.vramNote}</dt>
						<dd>{s.vram_note}</dd>
					</>
				) : null}
				{s.notes ? (
					<>
						<dt className="text-muted-foreground">{t.run.notes}</dt>
						<dd>{s.notes}</dd>
					</>
				) : null}
				{Object.keys(s.params ?? {}).length > 0 ? (
					<>
						<dt className="text-muted-foreground">{t.run.params}</dt>
						<dd>
							<pre className="font-mono text-[11px] leading-relaxed">{JSON.stringify(s.params, null, 2)}</pre>
						</dd>
					</>
				) : null}
			</dl>
		</Disclosure>
	);
}

import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RunMetrics } from "@/api/types";
import { t } from "@/i18n";
import { fmtInt, fmtMb, fmtMs, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Metric({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
	return (
		<div className={cn("min-w-0", className)}>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="tabular text-sm font-medium">{value}</div>
		</div>
	);
}

/** Compact strip used in Compare columns. */
export function MetricsStrip({ m, local }: { m: RunMetrics; local: boolean }) {
	return (
		<div className="space-y-1.5">
			<div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
				<Metric label={t.metrics.modelTime} value={fmtMs(m.model_ms)} />
				<Metric label={t.metrics.ttft} value={fmtMs(m.ttft_ms)} />
				<Metric
					label={local ? t.metrics.vram : t.metrics.cost}
					value={local ? fmtMb(m.gpu_peak_vram_delta_mb ?? m.model_vram_mb) : fmtUsd(m.cost_api_usd)}
				/>
				<Metric label={t.metrics.tokensIn} value={fmtInt(m.tokens_in_total)} />
				<Metric label={t.metrics.tokensOut} value={fmtInt(m.tokens_out)} />
				{local ? (
					<Metric label={t.metrics.cost} value={fmtUsd(m.cost_energy_usd ?? m.cost_api_usd)} />
				) : (
					<Metric label={t.metrics.tokensThinking} value={fmtInt(m.tokens_thinking)} />
				)}
			</div>
			{m.truncated_suspected ? <TruncatedNote /> : null}
			{m.cold_start ? <span className="text-xs text-muted-foreground">{t.metrics.coldStart}</span> : null}
		</div>
	);
}

export function TruncatedNote() {
	return (
		<span className="inline-flex items-center gap-1 text-xs text-status-interrupted">
			<AlertTriangleIcon aria-hidden className="size-3" />
			{t.metrics.truncated}
		</span>
	);
}

type Segment = { key: string; label: string; ms: number | null; color: string };

/** Horizontal stacked bar of the timing split. One hue family, ordered by pipeline stage. */
export function TimingBar({ m }: { m: RunMetrics }) {
	const segments: Segment[] = [
		{
			key: "upload",
			label: t.metrics.upload,
			ms: m.upload_ms,
			color: "var(--cost-2)",
		},
		{
			key: "extract",
			label: t.metrics.extract,
			ms: m.extract_ms,
			color: "var(--cost-3)",
		},
		{
			key: "load",
			label: t.metrics.load,
			ms: m.model_load_ms,
			color: "var(--cost-4)",
		},
		{
			key: "model",
			label: t.metrics.model,
			ms: m.model_ms,
			color: "var(--cost-5)",
		},
	].filter((s) => s.ms !== null && s.ms > 0);
	const total = segments.reduce((a, s) => a + (s.ms ?? 0), 0);
	if (total <= 0) return <p className="text-xs text-muted-foreground">{t.metrics.noMetrics}</p>;
	return (
		<div>
			<div
				className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm"
				role="img"
				aria-label={`${t.metrics.timing}: ${segments.map((s) => `${s.label} ${fmtMs(s.ms)}`).join(", ")}`}
			>
				{segments.map((s) => (
					<div
						key={s.key}
						title={`${s.label}: ${fmtMs(s.ms)}`}
						style={{
							width: `${((s.ms ?? 0) / total) * 100}%`,
							background: s.color,
						}}
						className="min-w-[2px]"
					/>
				))}
			</div>
			<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{segments.map((s) => (
					<li key={s.key} className="flex items-center gap-1.5">
						<span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
						<span className="text-muted-foreground">{s.label}</span>
						<span className="tabular font-medium">{fmtMs(s.ms)}</span>
					</li>
				))}
				<li className="flex items-center gap-1.5">
					<span className="text-muted-foreground">{t.metrics.totalTime}</span>
					<span className="tabular font-medium">{fmtMs(m.total_ms ?? total)}</span>
				</li>
			</ul>
		</div>
	);
}

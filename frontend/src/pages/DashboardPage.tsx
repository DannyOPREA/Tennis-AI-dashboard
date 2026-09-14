import { ArrowDownIcon, ArrowUpIcon, BarChart3Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/api/client";
import type { DashboardQuery, SummaryRow } from "@/api/types";
import { ProviderLegend, StarsBars, StarsScatter } from "@/components/charts/dashboard-charts";
import { BatchTable } from "@/components/common/batch-list";
import { ModeChip, ProviderDot } from "@/components/common/chips";
import { SimpleSelect } from "@/components/common/select";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, SectionTitle } from "@/components/common/states";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { t } from "@/i18n";
import { fmtInt, fmtMb, fmtMs, fmtNum, fmtStars, fmtUsd } from "@/lib/format";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { costStep, orderedProviders, providerLabel } from "@/lib/providers";
import { cn } from "@/lib/utils";

const ALL = "*";
const xFmtCost = (v: number | null) => fmtUsd(v);
const xFmtTime = (v: number | null) => (v === null ? "—" : fmtMs(v * 1000));

type ColKey =
	| "display_name"
	| "n"
	| "stars_mean"
	| "model_ms_median"
	| "ttft_ms_median"
	| "tokens_in_mean"
	| "tokens_out_mean"
	| "tokens_out_per_s_mean"
	| "cost_api_usd_mean"
	| "gpu_peak_vram_delta_mb_max"
	| "truncated_count"
	| "error_count";

const COLUMNS: { key: ColKey; label: string; numeric: boolean }[] = [
	{ key: "display_name", label: t.dashboard.colModel, numeric: false },
	{ key: "n", label: t.dashboard.colN, numeric: true },
	{ key: "stars_mean", label: t.dashboard.colStars, numeric: true },
	{ key: "model_ms_median", label: t.dashboard.colModelMs, numeric: true },
	{ key: "ttft_ms_median", label: t.dashboard.colTtft, numeric: true },
	{ key: "tokens_in_mean", label: t.dashboard.colTokensIn, numeric: true },
	{ key: "tokens_out_mean", label: t.dashboard.colTokensOut, numeric: true },
	{
		key: "tokens_out_per_s_mean",
		label: t.dashboard.colTokPerS,
		numeric: true,
	},
	{ key: "cost_api_usd_mean", label: t.dashboard.colCost, numeric: true },
	{
		key: "gpu_peak_vram_delta_mb_max",
		label: t.dashboard.colVram,
		numeric: true,
	},
	{ key: "truncated_count", label: t.dashboard.colTruncated, numeric: true },
	{ key: "error_count", label: t.dashboard.colErrors, numeric: true },
];

export function DashboardPage() {
	useDocumentTitle(`${t.dashboard.title} – ${t.app.name}`);
	const filters = useAsync(() => api.dashboard.filters(), []);
	const [promptId, setPromptId] = useState(ALL);
	const [videoId, setVideoId] = useState(ALL);
	const [host, setHost] = useState(ALL);
	const [preset, setPreset] = useState(ALL);
	const [includeCold, setIncludeCold] = useState(false);
	const [sort, setSort] = useState<{ key: ColKey; dir: "asc" | "desc" }>({
		key: "stars_mean",
		dir: "desc",
	});

	const query = useMemo<DashboardQuery>(
		() => ({
			prompt_id: promptId === ALL ? undefined : Number(promptId),
			video_id: videoId === ALL ? undefined : Number(videoId),
			host: host === ALL ? undefined : host,
			frame_preset: preset === ALL ? undefined : preset,
			include_cold: includeCold || undefined,
		}),
		[promptId, videoId, host, preset, includeCold],
	);
	const summary = useAsync(() => api.dashboard.summary(query), [query]);
	const points = useAsync(() => api.dashboard.runs(query), [query]);
	const batches = useAsync(() => api.batches.list(10), []);

	const rows = useMemo(() => {
		const xs = (summary.data ?? []).slice();
		const { key, dir } = sort;
		xs.sort((a, b) => {
			const av = a[key];
			const bv = b[key];
			if (av === null || av === undefined) return 1;
			if (bv === null || bv === undefined) return -1;
			const c = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
			return dir === "asc" ? c : -c;
		});
		return xs;
	}, [summary.data, sort]);
	const costMax = Math.max(0, ...rows.map((r) => r.cost_api_usd_mean ?? 0));
	const providers = orderedProviders([...rows, ...(points.data ?? [])]);
	const ratedPoints = (points.data ?? []).filter((p) => p.stars !== null);

	function toggleSort(key: ColKey, numeric: boolean) {
		setSort((s) =>
			s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: numeric ? "desc" : "asc" },
		);
	}

	const f = filters.data;
	const busy = summary.refreshing || points.refreshing;

	return (
		<>
			<PageHeader title={t.dashboard.title} description={t.dashboard.description} />

			{/* One filter row, above everything it scopes */}
			<div className="mb-6 flex flex-wrap items-end gap-3">
				<div className="space-y-1">
					<Label htmlFor="f-prompt" className="text-xs">
						{t.dashboard.prompt}
					</Label>
					<SimpleSelect
						id="f-prompt"
						size="sm"
						value={promptId}
						onChange={setPromptId}
						options={[
							{ value: ALL, label: t.dashboard.anyPrompt },
							...(f?.prompts ?? []).map((p) => ({
								value: String(p.id),
								label: p.name,
							})),
						]}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="f-video" className="text-xs">
						{t.dashboard.video}
					</Label>
					<SimpleSelect
						id="f-video"
						size="sm"
						value={videoId}
						onChange={setVideoId}
						options={[
							{ value: ALL, label: t.dashboard.anyVideo },
							...(f?.videos ?? []).map((v) => ({
								value: String(v.id),
								label: v.title,
							})),
						]}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="f-host" className="text-xs">
						{t.dashboard.host}
					</Label>
					<SimpleSelect
						id="f-host"
						size="sm"
						value={host}
						onChange={setHost}
						options={[
							{ value: ALL, label: t.dashboard.anyHost },
							...(f?.hosts ?? []).map((h) => ({ value: h, label: h })),
						]}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="f-preset" className="text-xs">
						{t.dashboard.preset}
					</Label>
					<SimpleSelect
						id="f-preset"
						size="sm"
						value={preset}
						onChange={setPreset}
						options={[
							{ value: ALL, label: t.dashboard.anyPreset },
							...(f?.presets ?? []).map((p) => ({ value: p, label: p })),
						]}
					/>
				</div>
				<label htmlFor="f-cold" className="flex h-7 items-center gap-2 text-xs">
					<Switch id="f-cold" size="sm" checked={includeCold} onCheckedChange={setIncludeCold} />
					{t.dashboard.includeCold}
				</label>
			</div>

			{filters.error ? (
				<ErrorState message={filters.error} onRetry={() => void filters.reload()} className="mb-4" />
			) : null}
			{summary.error && !summary.data ? (
				<ErrorState message={summary.error} onRetry={() => void summary.reload()} className="mb-4" />
			) : null}

			<div className={cn("space-y-8 transition-opacity", busy && "opacity-70")} aria-busy={busy}>
				<section>
					<SectionTitle hint={t.dashboard.summaryHint}>{t.dashboard.summary}</SectionTitle>
					{summary.loading && !summary.data ? <ListSkeleton rows={5} /> : null}
					{summary.data && rows.length === 0 ? (
						<EmptyState icon={BarChart3Icon} title={t.dashboard.empty} hint={t.dashboard.emptyHint} />
					) : null}
					{rows.length > 0 ? (
						<div className="overflow-x-auto rounded-xl border bg-card">
							<Table>
								<TableHeader>
									<TableRow>
										{COLUMNS.map((c) => (
											<TableHead
												key={c.key}
												className={cn(c.numeric && "text-right")}
												aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
											>
												<button
													type="button"
													onClick={() => toggleSort(c.key, c.numeric)}
													className={cn(
														"inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
														sort.key === c.key && "text-foreground",
													)}
												>
													{c.label}
													{sort.key === c.key ? (
														sort.dir === "asc" ? (
															<ArrowUpIcon aria-hidden className="size-3" />
														) : (
															<ArrowDownIcon aria-hidden className="size-3" />
														)
													) : null}
												</button>
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.map((r) => (
										<SummaryTableRow key={r.key} r={r} costMax={costMax} />
									))}
								</TableBody>
							</Table>
						</div>
					) : null}
				</section>

				<section className="grid gap-6 xl:grid-cols-2">
					<ChartCard
						title={t.dashboard.chartCostStars}
						hint={t.dashboard.chartCostStarsHint}
						providers={providers}
						empty={ratedPoints.length === 0}
					>
						<StarsScatter
							points={ratedPoints}
							x="cost_api_usd"
							xLabel={t.dashboard.axisCost}
							xFmt={xFmtCost}
							sqrtScale
						/>
					</ChartCard>
					<ChartCard
						title={t.dashboard.chartTimeStars}
						hint={t.dashboard.chartTimeStarsHint}
						providers={providers}
						empty={ratedPoints.length === 0}
					>
						<StarsScatter points={ratedPoints} x="model_ms" xLabel={t.dashboard.axisTime} xFmt={xFmtTime} />
					</ChartCard>
					<ChartCard
						title={t.dashboard.chartStarsBar}
						hint={t.dashboard.chartStarsBarHint}
						providers={providers}
						empty={rows.every((r) => r.stars_mean === null)}
						className="xl:col-span-2"
					>
						<StarsBars rows={rows} />
					</ChartCard>
				</section>

				<section>
					<SectionTitle>{t.dashboard.recentBatches}</SectionTitle>
					{batches.data && batches.data.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t.dashboard.recentEmpty}</p>
					) : null}
					{batches.data && batches.data.length > 0 ? <BatchTable batches={batches.data} compact /> : null}
				</section>
			</div>
		</>
	);
}

function ChartCard({
	title,
	hint,
	providers,
	empty,
	children,
	className,
}: {
	title: string;
	hint: string;
	providers: string[];
	empty: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("rounded-xl border bg-card p-4", className)}>
			<div className="mb-3 flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold">{title}</h3>
					<p className="text-xs text-muted-foreground">{hint}</p>
				</div>
				{!empty && providers.length > 1 ? <ProviderLegend providers={providers} /> : null}
			</div>
			{empty ? (
				<EmptyState title={t.dashboard.chartEmpty} hint={t.dashboard.chartEmptyHint} className="py-8" />
			) : (
				children
			)}
		</div>
	);
}

function SummaryTableRow({ r, costMax }: { r: SummaryRow; costMax: number }) {
	return (
		<TableRow>
			<TableCell>
				<div className="flex items-center gap-2">
					<ProviderDot provider={r.provider} />
					<span className="font-medium" title={providerLabel(r.provider)}>
						{r.display_name}
					</span>
					<ModeChip mode={r.input_mode} />
					<span className="text-xs text-muted-foreground">{r.frame_preset}</span>
				</div>
			</TableCell>
			<TableCell className="tabular text-right">
				{fmtInt(r.n)}
				{r.n_rated < r.n ? (
					<span className="ml-1 text-xs text-muted-foreground">
						({r.n - r.n_rated} {t.dashboard.unrated})
					</span>
				) : null}
			</TableCell>
			<TableCell className="tabular text-right font-medium">
				{fmtStars(r.stars_mean)}
				{r.stars_min !== null && r.stars_max !== null && r.stars_min !== r.stars_max ? (
					<span className="ml-1 text-xs font-normal text-muted-foreground">
						{r.stars_min}–{r.stars_max}
					</span>
				) : null}
			</TableCell>
			<TableCell className="tabular text-right">{fmtMs(r.model_ms_median)}</TableCell>
			<TableCell className="tabular text-right">{fmtMs(r.ttft_ms_median)}</TableCell>
			<TableCell className="tabular text-right">{fmtInt(r.tokens_in_mean)}</TableCell>
			<TableCell className="tabular text-right">{fmtInt(r.tokens_out_mean)}</TableCell>
			<TableCell className="tabular text-right">{fmtNum(r.tokens_out_per_s_mean)}</TableCell>
			<TableCell className="tabular text-right">
				<span className="rounded px-1.5 py-0.5" style={{ background: costStep(r.cost_api_usd_mean, costMax) }}>
					{fmtUsd(r.cost_api_usd_mean)}
				</span>
			</TableCell>
			<TableCell className="tabular text-right">{fmtMb(r.gpu_peak_vram_delta_mb_max)}</TableCell>
			<TableCell className={cn("tabular text-right", r.truncated_count > 0 && "text-status-interrupted")}>
				{fmtInt(r.truncated_count)}
			</TableCell>
			<TableCell className={cn("tabular text-right", r.error_count > 0 && "text-destructive")}>
				{fmtInt(r.error_count)}
			</TableCell>
		</TableRow>
	);
}

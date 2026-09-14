import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { PointRow, SummaryRow } from "@/api/types";
import { t } from "@/i18n";
import { fmtStars } from "@/lib/format";
import { providerColor, providerLabel } from "@/lib/providers";

const INK = "var(--baseline)";
const MUTED = "var(--sideline)";
const GRID = "var(--net)";

/** Legend for the provider palette: identity is never colour-alone. */
export function ProviderLegend({ providers }: { providers: string[] }) {
	return (
		<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
			{providers.map((p) => (
				<li key={p} className="flex items-center gap-1.5">
					<span aria-hidden className="size-2 rounded-full" style={{ background: providerColor(p) }} />
					{providerLabel(p)}
				</li>
			))}
		</ul>
	);
}

type JitterPoint = PointRow & { y: number; x: number };

/** Stars are integers; a small deterministic jitter keeps overlapping runs visible. */
function jitter(id: number): number {
	return (((id * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.3;
}

function PointTooltip({
	active,
	payload,
	xLabel,
	xFmt,
}: {
	active?: boolean;
	payload?: ReadonlyArray<{ payload?: unknown }>;
	xLabel: string;
	xFmt: (v: number | null) => string;
}) {
	if (!active || !payload || payload.length === 0) return null;
	const p = payload[0]?.payload as JitterPoint | undefined;
	if (!p) return null;
	return (
		<div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
			<div className="flex items-center gap-1.5 font-medium text-foreground">
				<span aria-hidden className="size-2 rounded-full" style={{ background: providerColor(p.provider) }} />
				{p.display_name}
			</div>
			<div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
				<span className="text-muted-foreground">{t.dashboard.axisStars}</span>
				<span className="tabular font-medium text-foreground">{p.stars ?? "—"}</span>
				<span className="text-muted-foreground">{xLabel}</span>
				<span className="tabular font-medium text-foreground">{xFmt(p.x)}</span>
				<span className="text-muted-foreground">{t.dashboard.video}</span>
				<span className="text-foreground">#{p.video_id}</span>
				<span className="text-muted-foreground">{t.compare.batch(p.batch_id)}</span>
				<span className="text-foreground">{p.input_mode}</span>
			</div>
		</div>
	);
}

export function StarsScatter({
	points,
	x,
	xLabel,
	xFmt,
	sqrtScale,
}: {
	points: PointRow[];
	x: "cost_api_usd" | "model_ms";
	xLabel: string;
	xFmt: (v: number | null) => string;
	sqrtScale?: boolean;
}) {
	const data: JitterPoint[] = points
		.filter((p) => p.stars !== null && p[x] !== null)
		.map((p) => ({
			...p,
			x: x === "model_ms" ? (p.model_ms ?? 0) / 1000 : (p.cost_api_usd ?? 0),
			y: (p.stars ?? 0) + jitter(p.run_id),
		}));
	if (data.length === 0) return null;
	return (
		<ResponsiveContainer width="100%" height={260}>
			<ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
				<CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
				<XAxis
					type="number"
					dataKey="x"
					scale={sqrtScale ? "sqrt" : "linear"}
					domain={[0, "auto"]}
					tick={{ fill: MUTED, fontSize: 11 }}
					tickLine={false}
					axisLine={{ stroke: GRID }}
					tickFormatter={(v: number) =>
						x === "model_ms" ? `${v}` : v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`
					}
					label={{
						value: xLabel,
						position: "insideBottom",
						offset: -12,
						fill: MUTED,
						fontSize: 11,
					}}
				/>
				<YAxis
					type="number"
					dataKey="y"
					domain={[0.5, 5.5]}
					ticks={[1, 2, 3, 4, 5]}
					tick={{ fill: MUTED, fontSize: 11 }}
					tickLine={false}
					axisLine={false}
					width={28}
					label={{
						value: t.dashboard.axisStars,
						angle: -90,
						position: "insideLeft",
						fill: MUTED,
						fontSize: 11,
					}}
				/>
				<Tooltip
					cursor={false}
					isAnimationActive={false}
					content={(props) => (
						<PointTooltip active={props.active} payload={props.payload} xLabel={xLabel} xFmt={xFmt} />
					)}
				/>
				<Scatter
					data={data}
					isAnimationActive={false}
					shape={(p: unknown) => <PointMark {...(p as { cx?: number; cy?: number; payload?: JitterPoint })} />}
				/>
			</ScatterChart>
		</ResponsiveContainer>
	);
}

function PointMark({ cx, cy, payload }: { cx?: number; cy?: number; payload?: JitterPoint }) {
	if (cx === undefined || cy === undefined || !payload) return null;
	return (
		<g>
			{/* hit area larger than the mark */}
			<circle cx={cx} cy={cy} r={12} fill="transparent" />
			<circle cx={cx} cy={cy} r={5} fill={providerColor(payload.provider)} stroke="var(--card)" strokeWidth={2} />
		</g>
	);
}

type BarDatum = {
	key: string;
	name: string;
	provider: string;
	stars: number;
	n: number;
};

function BarTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
	if (!active || !payload || payload.length === 0) return null;
	const d = payload[0]?.payload as BarDatum | undefined;
	if (!d) return null;
	return (
		<div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
			<div className="flex items-center gap-1.5 font-medium text-foreground">
				<span aria-hidden className="size-2 rounded-full" style={{ background: providerColor(d.provider) }} />
				{d.name}
			</div>
			<div className="mt-1 text-foreground">
				<span className="tabular font-medium">{fmtStars(d.stars)}</span>{" "}
				<span className="text-muted-foreground">{t.dashboard.axisStars.toLowerCase()}</span>,{" "}
				<span className="tabular">{t.dashboard.nLabel(d.n)}</span>
			</div>
		</div>
	);
}

export function StarsBars({ rows }: { rows: SummaryRow[] }) {
	const data: BarDatum[] = rows
		.filter((r) => r.stars_mean !== null && r.n_rated > 0)
		.map((r) => ({
			key: r.key,
			name: `${r.display_name} (${r.input_mode === "native_video" ? t.inputMode.native_video : t.inputMode.frames})`,
			provider: r.provider,
			stars: r.stars_mean ?? 0,
			n: r.n_rated,
		}))
		.sort((a, b) => b.stars - a.stars);
	if (data.length === 0) return null;
	const height = 40 + data.length * 30;
	return (
		<ResponsiveContainer width="100%" height={height}>
			<BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={8}>
				<CartesianGrid stroke={GRID} horizontal={false} />
				<XAxis
					type="number"
					domain={[0, 5]}
					ticks={[0, 1, 2, 3, 4, 5]}
					tick={{ fill: MUTED, fontSize: 11 }}
					tickLine={false}
					axisLine={{ stroke: GRID }}
				/>
				<YAxis
					type="category"
					dataKey="name"
					width={200}
					tick={{ fill: INK, fontSize: 12 }}
					tickLine={false}
					axisLine={false}
					interval={0}
				/>
				<Tooltip
					cursor={{ fill: "var(--muted)", opacity: 0.5 }}
					isAnimationActive={false}
					content={(props) => <BarTooltip active={props.active} payload={props.payload} />}
				/>
				<Bar dataKey="stars" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
					{data.map((d) => (
						<Cell key={d.key} fill={providerColor(d.provider)} />
					))}
					<LabelList
						dataKey="n"
						position="right"
						formatter={(v: unknown) => t.dashboard.nLabel(Number(v))}
						fill={MUTED}
						fontSize={11}
					/>
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}

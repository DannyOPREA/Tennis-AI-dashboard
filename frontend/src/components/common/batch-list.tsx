import { DownloadIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { BatchSummary, RunStatus } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { t } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/providers";

const ORDER: RunStatus[] = ["done", "running", "queued", "error", "interrupted", "cancelled"];

/** Tiny segmented bar of run statuses in a batch, with an accessible text label. */
export function StatusBar({ counts, total }: { counts: Partial<Record<RunStatus, number>>; total: number }) {
	const parts = ORDER.map((s) => ({ s, n: counts[s] ?? 0 })).filter((p) => p.n > 0);
	const label = parts.map((p) => `${p.n} ${t.status[p.s].toLowerCase()}`).join(", ");
	if (total === 0) return <span className="text-xs text-muted-foreground">{t.common.none}</span>;
	return (
		<div className="flex items-center gap-2" title={label}>
			<div className="flex h-2 w-24 gap-px overflow-hidden rounded-sm" role="img" aria-label={label}>
				{parts.map((p) => (
					<span
						key={p.s}
						style={{
							width: `${(p.n / total) * 100}%`,
							background: STATUS_COLORS[p.s],
						}}
					/>
				))}
			</div>
			<span className="tabular text-xs text-muted-foreground">{total}</span>
		</div>
	);
}

export function BatchTable({ batches, compact }: { batches: BatchSummary[]; compact?: boolean }) {
	return (
		<div className="overflow-x-auto rounded-xl border bg-card">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t.batches.colBatch}</TableHead>
						<TableHead>{t.batches.colVideo}</TableHead>
						{!compact ? <TableHead>{t.batches.colPrompt}</TableHead> : null}
						{!compact ? <TableHead>{t.batches.colPreset}</TableHead> : null}
						<TableHead>{t.batches.colRuns}</TableHead>
						<TableHead>{t.batches.colCreated}</TableHead>
						<TableHead className="w-px" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{batches.map((b) => (
						<TableRow key={b.id}>
							<TableCell>
								<Link to={`/batches/${b.id}`} className="font-medium hover:underline">
									{b.name || t.compare.batch(b.id)}
								</Link>
								{b.blind ? (
									<span className="ml-2 rounded-full border border-dashed px-1.5 text-[10px] text-muted-foreground">
										{t.batches.blind}
									</span>
								) : null}
							</TableCell>
							<TableCell className="max-w-48 truncate">{b.video_title}</TableCell>
							{!compact ? (
								<TableCell className="max-w-48 truncate">
									{b.prompt_name} <span className="text-muted-foreground">v{b.prompt_version}</span>
								</TableCell>
							) : null}
							{!compact ? <TableCell className="text-muted-foreground">{b.frame_preset}</TableCell> : null}
							<TableCell>
								<StatusBar counts={b.counts} total={b.run_count} />
							</TableCell>
							<TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(b.created_at)}</TableCell>
							<TableCell>
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={t.common.export}
									render={<a href={api.batches.exportUrl(b.id)} download />}
								>
									<DownloadIcon />
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

import type { LucideIcon } from "lucide-react";
import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function PageHeader({
	title,
	description,
	actions,
	eyebrow,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	eyebrow?: ReactNode;
}) {
	return (
		<header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
			<div className="min-w-0">
				{eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
				<h1 className="font-heading text-[26px] leading-tight font-semibold">{title}</h1>
				{description ? <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{description}</p> : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
		</header>
	);
}

export function SectionTitle({
	children,
	hint,
	actions,
}: {
	children: ReactNode;
	hint?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
			<div>
				<h2 className="text-base font-semibold">{children}</h2>
				{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
			</div>
			{actions}
		</div>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	hint,
	action,
	className,
}: {
	icon?: LucideIcon;
	title: ReactNode;
	hint?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center",
				className,
			)}
		>
			{Icon ? <Icon aria-hidden className="mb-3 size-6 text-muted-foreground" /> : null}
			<p className="text-sm font-medium">{title}</p>
			{hint ? <p className="mt-1 max-w-[44ch] text-sm text-muted-foreground">{hint}</p> : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}

export function ErrorState({
	message,
	onRetry,
	className,
}: {
	message: string;
	onRetry?: () => void;
	className?: string;
}) {
	return (
		<div
			role="alert"
			className={cn(
				"flex items-start gap-3 rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm",
				className,
			)}
		>
			<AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
			<div className="min-w-0 flex-1">
				<p className="font-medium">{t.common.errorTitle}</p>
				<p className="text-muted-foreground break-words">{message}</p>
			</div>
			{onRetry ? (
				<Button size="sm" variant="outline" onClick={onRetry}>
					{t.common.retry}
				</Button>
			) : null}
		</div>
	);
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
	return (
		<div className={cn("space-y-2", className)} aria-busy>
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
				<Skeleton key={`sk-${i}-${rows}`} className="h-10 w-full" />
			))}
		</div>
	);
}

export function CardGridSkeleton({ n = 6 }: { n?: number }) {
	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4" aria-busy>
			{Array.from({ length: n }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cards
				<div key={`cg-${i}-${n}`} className="overflow-hidden rounded-xl border bg-card">
					<Skeleton className="aspect-video w-full rounded-none" />
					<div className="space-y-2 p-3">
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-3 w-1/3" />
					</div>
				</div>
			))}
		</div>
	);
}

export function InlineLabel({ children }: { children: ReactNode }) {
	return <span className="text-xs text-muted-foreground">{children}</span>;
}

import {
	AlertTriangleIcon,
	BanIcon,
	CheckIcon,
	CircleDashedIcon,
	CircleIcon,
	type LucideIcon,
	PauseIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { InputMode, RunStatus } from "@/api/types";
import { t } from "@/i18n";
import { providerColor, providerLabel, STATUS_COLORS } from "@/lib/providers";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<RunStatus, LucideIcon> = {
	queued: CircleDashedIcon,
	running: CircleIcon,
	done: CheckIcon,
	error: AlertTriangleIcon,
	interrupted: PauseIcon,
	cancelled: BanIcon,
};

export function StatusChip({
	status,
	stage,
	className,
}: {
	status: RunStatus;
	stage?: string | null;
	className?: string;
}) {
	const Icon = STATUS_ICON[status];
	const color = STATUS_COLORS[status];
	return (
		<span
			className={cn(
				"inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
				className,
			)}
			style={{
				color,
				borderColor: `color-mix(in oklch, ${color} 35%, transparent)`,
			}}
		>
			{status === "running" ? (
				<span aria-hidden className="live-dot size-2 rounded-full" style={{ background: color }} />
			) : (
				<Icon aria-hidden className="size-3" />
			)}
			{t.status[status]}
			{status === "running" && stage ? <span className="font-normal text-muted-foreground">{stage}</span> : null}
		</span>
	);
}

/** Provider-coloured model chip. `hidden` renders the neutral blind label. */
export function ModelChip({
	provider,
	label,
	hidden,
	hiddenLabel,
	size = "sm",
	className,
}: {
	provider: string | null | undefined;
	label: ReactNode;
	hidden?: boolean;
	hiddenLabel?: string;
	size?: "sm" | "lg";
	className?: string;
}) {
	const color = hidden ? "var(--sideline)" : providerColor(provider);
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-2 rounded-full border bg-card font-medium",
				size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-sm",
				hidden && "border-dashed",
				className,
			)}
			title={hidden ? undefined : providerLabel(provider)}
		>
			<span
				aria-hidden
				className={cn("shrink-0 rounded-full", size === "sm" ? "size-2" : "size-2.5")}
				style={{ background: color }}
			/>
			<span className="truncate">{hidden ? hiddenLabel : label}</span>
		</span>
	);
}

export function ProviderDot({ provider, className }: { provider: string; className?: string }) {
	return (
		<span
			aria-hidden
			className={cn("inline-block size-2 shrink-0 rounded-full", className)}
			style={{ background: providerColor(provider) }}
		/>
	);
}

export function ProviderChip({ provider }: { provider: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<ProviderDot provider={provider} />
			{providerLabel(provider)}
		</span>
	);
}

export function ModeChip({ mode }: { mode: InputMode | string }) {
	const label = mode === "native_video" ? t.inputMode.native_video : mode === "frames" ? t.inputMode.frames : mode;
	return (
		<span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
			{label}
		</span>
	);
}

export function Tag({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex h-5 items-center rounded-full border px-2 text-[11px] text-muted-foreground">
			{children}
		</span>
	);
}

import type { RunStatus } from "@/api/types";
import { t } from "@/i18n";

// Categorical palette: colour follows the provider entity, never its rank.
export const PROVIDER_COLORS: Record<string, string> = {
	gemini: "#2a78d6",
	ollama: "#0d8f5f",
	openai_compat: "#4a3aa7",
};
export const PROVIDER_UNKNOWN = "#5f6662";

export function providerColor(provider: string | null | undefined): string {
	if (!provider) return PROVIDER_UNKNOWN;
	return PROVIDER_COLORS[provider] ?? PROVIDER_UNKNOWN;
}

export function providerLabel(provider: string | null | undefined): string {
	switch (provider) {
		case "gemini":
			return t.provider.gemini;
		case "ollama":
			return t.provider.ollama;
		case "openai_compat":
			return t.provider.openai_compat;
		default:
			return provider ?? t.provider.unknown;
	}
}

export function isLocalProvider(provider: string | null | undefined): boolean {
	return provider === "ollama" || provider === "openai_compat";
}

export const STATUS_COLORS: Record<RunStatus, string> = {
	queued: "var(--status-queued)",
	running: "var(--status-running)",
	done: "var(--status-done)",
	error: "var(--status-error)",
	interrupted: "var(--status-interrupted)",
	cancelled: "var(--status-cancelled)",
};

export const ACTIVE_STATUSES: RunStatus[] = ["queued", "running"];
export const isActive = (s: RunStatus) => ACTIVE_STATUSES.includes(s);
export const canRetry = (s: RunStatus) => s === "error" || s === "interrupted" || s === "cancelled";

/** Sequential tint for table cells: the light end of the cost ramp, so ink on top stays legible. */
export const COST_RAMP = ["var(--cost-1)", "var(--cost-2)", "var(--cost-3)"];
export function costStep(value: number | null, max: number): string | undefined {
	if (value === null || max <= 0 || value <= 0) return undefined;
	const i = Math.min(COST_RAMP.length - 1, Math.floor((value / max) * COST_RAMP.length));
	return COST_RAMP[i];
}

/** Providers present in `rows`, in the fixed palette order (unknown providers last). */
export function orderedProviders(rows: { provider: string }[]): string[] {
	const present = new Set(rows.map((r) => r.provider));
	const known = Object.keys(PROVIDER_COLORS).filter((p) => present.has(p));
	const unknown = Array.from(present).filter((p) => !(p in PROVIDER_COLORS));
	return [...known, ...unknown];
}

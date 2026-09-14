const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export const DASH = "—";

export function fmtInt(n: number | null | undefined): string {
	if (n === null || n === undefined || Number.isNaN(n)) return DASH;
	return nf0.format(n);
}

export function fmtTokens(n: number | null | undefined): string {
	return fmtInt(n);
}

/** Milliseconds to a human duration: 840 ms, 2.3 s, 1 m 12 s. */
export function fmtMs(ms: number | null | undefined): string {
	if (ms === null || ms === undefined || Number.isNaN(ms)) return DASH;
	if (ms < 1000) return `${nf0.format(ms)} ms`;
	const s = ms / 1000;
	if (s < 60) return `${nf1.format(s)} s`;
	const m = Math.floor(s / 60);
	const rem = Math.round(s - m * 60);
	return `${m} m ${rem} s`;
}

/** Seconds of video: 0:42, 1:05. */
export function fmtClock(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return DASH;
	const total = Math.round(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

/** USD; four decimals under one cent, otherwise two. Zero is "$0". */
export function fmtUsd(v: number | null | undefined): string {
	if (v === null || v === undefined || Number.isNaN(v)) return DASH;
	if (v === 0) return "$0";
	if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
	return `$${nf2.format(v)}`;
}

export function fmtMb(mb: number | null | undefined): string {
	if (mb === null || mb === undefined || Number.isNaN(mb)) return DASH;
	if (mb >= 1024) return `${nf1.format(mb / 1024)} GB`;
	return `${nf0.format(mb)} MB`;
}

export function fmtBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined) return DASH;
	if (bytes >= 1024 ** 3) return `${nf1.format(bytes / 1024 ** 3)} GB`;
	if (bytes >= 1024 ** 2) return `${nf1.format(bytes / 1024 ** 2)} MB`;
	if (bytes >= 1024) return `${nf0.format(bytes / 1024)} KB`;
	return `${bytes} B`;
}

export function fmtStars(v: number | null | undefined): string {
	if (v === null || v === undefined || Number.isNaN(v)) return DASH;
	return v.toFixed(2);
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
	if (v === null || v === undefined || Number.isNaN(v)) return DASH;
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: digits,
	}).format(v);
}

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return DASH;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(d);
}

export function fmtRelative(iso: string | null | undefined): string {
	if (!iso) return DASH;
	const d = new Date(iso).getTime();
	if (Number.isNaN(d)) return iso;
	const diff = Math.round((Date.now() - d) / 1000);
	if (diff < 60) return "just now";
	if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
	return fmtDate(iso);
}

export function fmtPercent(fraction: number): string {
	return `${Math.round(fraction * 100)}%`;
}

export function fmtDims(w: number, h: number): string {
	return `${w}×${h}`;
}

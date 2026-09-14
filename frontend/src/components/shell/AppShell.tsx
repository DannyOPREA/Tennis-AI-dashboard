import { BarChart3Icon, FilmIcon, LayersIcon, MenuIcon, MessageSquareTextIcon, PlayIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "@/api/client";
import type { Health } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { t } from "@/i18n";
import { fmtMb } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
	{ to: "/", label: t.nav.library, icon: FilmIcon, end: true },
	{ to: "/runs/new", label: t.nav.newRun, icon: PlayIcon, end: false },
	{ to: "/batches", label: t.nav.batches, icon: LayersIcon, end: false },
	{
		to: "/prompts",
		label: t.nav.prompts,
		icon: MessageSquareTextIcon,
		end: false,
	},
	{ to: "/dashboard", label: t.nav.dashboard, icon: BarChart3Icon, end: false },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
	return (
		<nav aria-label={t.app.menu} className="flex flex-col gap-0.5">
			{NAV.map(({ to, label, icon: Icon, end }) => (
				<NavLink
					key={to}
					to={to}
					end={end}
					onClick={onNavigate}
					className={({ isActive }) =>
						cn(
							"flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm",
							isActive
								? "bg-secondary font-medium text-foreground"
								: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
						)
					}
				>
					<Icon aria-hidden className="size-4" />
					{label}
				</NavLink>
			))}
		</nav>
	);
}

function Wordmark() {
	return (
		<div className="flex items-center gap-2.5 px-2.5">
			<span aria-hidden className="grid size-7 place-items-center rounded-md bg-terre text-white">
				<svg
					viewBox="0 0 32 32"
					className="size-5"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.4"
					strokeLinecap="round"
				>
					<title>{t.app.shortName}</title>
					<circle cx="16" cy="16" r="8.5" />
					<path d="M10.5 10.5c3 2 3 9 0 11M21.5 10.5c-3 2-3 9 0 11" />
				</svg>
			</span>
			<div className="leading-tight">
				<div className="font-heading text-[15px] font-semibold">{t.app.shortName}</div>
				<div className="text-[11px] text-muted-foreground">{t.app.tagline}</div>
			</div>
		</div>
	);
}

function HealthDot({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
	const color = ok === null ? "var(--net)" : ok ? "var(--status-done)" : "var(--status-error)";
	return (
		<li className="flex items-center gap-2 text-xs" title={detail}>
			<span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
			<span className="text-foreground">{label}</span>
			<span className="ml-auto truncate text-muted-foreground">{detail}</span>
		</li>
	);
}

export function HealthPanel({ health, error }: { health: Health | null; error: string | null }) {
	if (error && !health) {
		return (
			<div className="px-2.5 text-xs text-destructive" role="status">
				{t.health.unreachable}
			</div>
		);
	}
	const h = health;
	return (
		<div className="px-2.5">
			<div className="mb-1.5 text-xs text-muted-foreground">
				{t.health.title}
				{h ? <span className="ml-1 text-muted-foreground/70">{h.host}</span> : null}
			</div>
			<ul className="space-y-1">
				<HealthDot
					ok={h ? h.gemini_configured : null}
					label={t.health.gemini}
					detail={h ? (h.gemini_configured ? t.health.geminiOk : t.health.geminiMissing) : t.health.checking}
				/>
				<HealthDot
					ok={h ? h.ollama_reachable : null}
					label={t.health.ollama}
					detail={
						h
							? h.ollama_reachable
								? t.health.ollamaOk
								: h.ollama_url
									? t.health.ollamaDown
									: t.health.ollamaUnset
							: t.health.checking
					}
				/>
				<HealthDot
					ok={h ? h.gpu.available : null}
					label={t.health.gpu}
					detail={
						h
							? h.gpu.available
								? `${h.gpu.name ?? ""} ${h.gpu.vram_total_mb ? fmtMb(h.gpu.vram_total_mb) : ""}`.trim()
								: t.health.gpuNone
							: t.health.checking
					}
				/>
			</ul>
		</div>
	);
}

export function AppShell() {
	const health = useAsync(() => api.health(), []);
	const [open, setOpen] = useState(false);
	const location = useLocation();

	// Re-check health every 30 s; cheap, and it keeps the indicator honest.
	useEffect(() => {
		const id = window.setInterval(() => void health.reload(), 30_000);
		return () => window.clearInterval(id);
	}, [health.reload]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
	useEffect(() => setOpen(false), [location.pathname]);

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[208px_1fr]">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-1.5"
			>
				{t.app.skipToContent}
			</a>

			{/* Desktop rail */}
			<aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar py-4 pr-3 pl-3 md:flex">
				<Wordmark />
				<NavList />
				<div className="mt-auto">
					<HealthPanel health={health.data} error={health.error} />
				</div>
			</aside>

			{/* Mobile top bar */}
			<header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-sidebar pr-2 pl-1 md:hidden">
				<Wordmark />
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetTrigger render={<Button variant="ghost" size="icon" aria-label={t.app.menu} />}>
						<MenuIcon />
					</SheetTrigger>
					<SheetContent side="left" className="w-72 gap-6 p-3">
						<SheetTitle className="sr-only">{t.app.menu}</SheetTitle>
						<Wordmark />
						<NavList onNavigate={() => setOpen(false)} />
						<div className="mt-auto">
							<HealthPanel health={health.data} error={health.error} />
						</div>
					</SheetContent>
				</Sheet>
			</header>

			<main id="main" className="min-w-0 px-4 py-5 md:px-6 md:py-6">
				<div className="mx-auto w-full max-w-[1280px]">
					<Outlet context={{ health: health.data }} />
				</div>
			</main>
		</div>
	);
}

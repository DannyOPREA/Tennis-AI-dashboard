import { CheckIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { ErrorState, PageHeader } from "@/components/common/states";
import { GeminiKeyField } from "@/components/settings/gemini";
import { LocalModelList, OllamaStatusCard } from "@/components/settings/ollama";
import { useHealth } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { useOllama } from "@/lib/ollama";
import { useSetup } from "@/lib/setup";
import { cn } from "@/lib/utils";

export function WelcomePage() {
	useDocumentTitle(`${t.welcome.title} – ${t.app.name}`);
	const setup = useSetup();
	const settings = useAsync(() => api.settings.get(), []);
	const manager = useOllama();
	const health = useHealth();
	const navigate = useNavigate();
	const { reload: reloadSetup, skip } = setup;

	// The provider fetched setup on app load; a visit here deserves fresh numbers.
	useEffect(() => {
		void reloadSetup();
	}, [reloadSetup]);

	// When downloads finish, the "models installed" count changes.
	const wasPulling = useRef(false);
	useEffect(() => {
		if (wasPulling.current && !manager.anyPulling) void reloadSetup();
		wasPulling.current = manager.anyPulling;
	}, [manager.anyPulling, reloadSetup]);

	const recommended = useMemo(() => manager.models.filter((m) => m.enabled).slice(0, 2), [manager.models]);
	const recommendedPending = recommended.filter((m) => manager.stateOf(m).kind === "absent");
	const reachable = manager.status?.reachable ?? false;

	const status = setup.status;
	const step1 = status ? status.gemini_key_set && status.gemini_ok !== false : null;
	const step2 = status ? status.ollama_reachable && status.models_available > 0 : null;
	const step3 = status ? status.videos > 0 : null;

	function finish() {
		navigate("/", { replace: true });
	}

	function skipForNow() {
		skip();
		navigate("/", { replace: true });
	}

	return (
		<div className="mx-auto max-w-3xl">
			<PageHeader title={t.welcome.title} description={t.welcome.description} />

			{setup.error && !status ? <ErrorState message={setup.error} onRetry={() => void reloadSetup()} /> : null}

			<ol className="space-y-4">
				<Step n={1} done={step1} title={t.welcome.step1} hint={t.welcome.step1Hint}>
					<GeminiKeyField
						settings={settings.data}
						hideHint
						onSaved={(s) => {
							settings.setData(s);
							void health.reload();
							void reloadSetup();
						}}
					/>
				</Step>

				<Step
					n={2}
					done={step2}
					title={t.welcome.step2}
					hint={t.welcome.step2Hint}
					meta={status ? t.welcome.step2Progress(status.models_available, status.models_total_local) : undefined}
				>
					<div className="space-y-3">
						<OllamaStatusCard manager={manager} />
						{recommended.length > 0 ? (
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<Button
									size="sm"
									disabled={!reachable || recommendedPending.length === 0}
									title={reachable ? undefined : t.settings.ollama.needsOllama}
									onClick={() => {
										for (const m of recommendedPending) void manager.pull(m.id);
									}}
								>
									<DownloadIcon data-icon="inline-start" />
									{t.welcome.downloadRecommended}
								</Button>
								<span className="text-xs text-muted-foreground">
									{t.welcome.downloadRecommendedHint(recommended.map((m) => m.display_name).join(" and "))}
								</span>
							</div>
						) : null}
						<LocalModelList manager={manager} />
					</div>
				</Step>

				<Step
					n={3}
					done={step3}
					title={t.welcome.step3}
					hint={t.welcome.step3Hint}
					meta={status && status.videos > 0 ? t.welcome.step3Done(status.videos) : undefined}
				>
					<Button size="sm" variant={step3 ? "outline" : "default"} render={<Link to="/" />}>
						<UploadIcon data-icon="inline-start" />
						{t.welcome.goToLibrary}
					</Button>
				</Step>
			</ol>

			<footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
				{status?.complete ? (
					<>
						<p className="flex items-center gap-2 text-sm text-status-done">
							<CheckIcon aria-hidden className="size-4" />
							{t.welcome.allDone}
						</p>
						<Button onClick={finish}>{t.welcome.finish}</Button>
					</>
				) : (
					<>
						<span />
						<Button variant="link" className="px-0 text-muted-foreground" onClick={skipForNow}>
							{t.welcome.skip}
						</Button>
					</>
				)}
			</footer>
		</div>
	);
}

function Step({
	n,
	done,
	title,
	hint,
	meta,
	children,
}: {
	n: number;
	/** null while the setup status is loading */
	done: boolean | null;
	title: string;
	hint: string;
	meta?: string;
	children: ReactNode;
}) {
	return (
		<li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 rounded-xl border bg-card p-4 sm:p-5">
			<span
				aria-hidden
				className={cn(
					"tabular grid size-7 place-items-center rounded-full border text-xs font-medium",
					done ? "border-status-done bg-status-done text-white" : "text-muted-foreground",
				)}
			>
				{done ? <CheckIcon className="size-4" /> : n}
			</span>
			<div className="min-w-0">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<h2 className="font-heading text-lg leading-tight font-semibold">{title}</h2>
					{done === null ? (
						<Skeleton className="h-4 w-14" />
					) : (
						<span className={cn("text-xs", done ? "text-status-done" : "text-muted-foreground")}>
							{done ? t.welcome.stepDone : t.welcome.stepTodo}
							{meta ? <span className="text-muted-foreground">, {meta}</span> : null}
						</span>
					)}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{hint}</p>
				<div className="mt-4">{children}</div>
			</div>
		</li>
	);
}

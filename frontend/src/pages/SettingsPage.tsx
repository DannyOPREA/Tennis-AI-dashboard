import { CompassIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "@/api/client";
import type { Settings } from "@/api/types";
import { Disclosure } from "@/components/common/output";
import { ErrorState, PageHeader } from "@/components/common/states";
import { GeminiKeyField } from "@/components/settings/gemini";
import { LocalModelList, OllamaStatusCard } from "@/components/settings/ollama";
import { useHealth } from "@/components/shell/AppShell";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { fmtMb } from "@/lib/format";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { useOllama } from "@/lib/ollama";
import { useSetup } from "@/lib/setup";

export function SettingsPage() {
	useDocumentTitle(`${t.settings.title} – ${t.app.name}`);
	const settings = useAsync(() => api.settings.get(), []);
	const manager = useOllama();
	const health = useHealth();
	const setup = useSetup();
	const { setData } = settings;

	function onSettingsChanged(s: Settings) {
		setData(s);
		void health.reload();
		void setup.reload();
	}

	return (
		<>
			<PageHeader
				title={t.settings.title}
				description={t.settings.description}
				actions={
					<Button variant="outline" size="sm" render={<Link to="/welcome" />}>
						<CompassIcon data-icon="inline-start" />
						{t.settings.setupGuide}
					</Button>
				}
			/>

			{settings.error && !settings.data ? (
				<ErrorState message={settings.error} onRetry={() => void settings.reload()} className="mb-6" />
			) : null}

			<div className="divide-y">
				<Section title={t.settings.gemini.title} hint={t.settings.gemini.hint}>
					<GeminiKeyField settings={settings.data} onSaved={onSettingsChanged} hideHint />
				</Section>

				<Section title={t.settings.ollama.title} hint={t.settings.ollama.hint}>
					<div className="space-y-4">
						<OllamaStatusCard manager={manager} />
						<div>
							<h3 className="text-sm font-medium">{t.settings.ollama.modelsTitle}</h3>
							<p className="mb-2 text-xs text-muted-foreground">{t.settings.ollama.modelsHint}</p>
							<LocalModelList manager={manager} allowRemove />
						</div>
						<Disclosure title={t.settings.ollama.advanced}>
							<OllamaUrlForm
								settings={settings.data}
								onSaved={(s) => {
									onSettingsChanged(s);
									void manager.reload();
								}}
							/>
						</Disclosure>
					</div>
				</Section>

				<Section title={t.settings.computer.title} hint={t.settings.computer.hint}>
					<ComputerForm settings={settings.data} onSaved={onSettingsChanged} />
				</Section>

				<Section title={t.settings.gpu.title} hint={t.settings.gpu.hint}>
					<GpuInfo />
				</Section>
			</div>
		</>
	);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
	return (
		<section className="grid gap-x-8 gap-y-3 py-6 first:pt-0 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
			<div>
				<h2 className="text-base font-semibold">{title}</h2>
				{hint ? <p className="mt-0.5 max-w-[36ch] text-xs text-muted-foreground">{hint}</p> : null}
			</div>
			<div className="min-w-0 max-w-2xl">{children}</div>
		</section>
	);
}

type SaveState = "idle" | "saving" | "saved" | "error";

function useSaveState() {
	const [state, setState] = useState<SaveState>("idle");
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (state !== "saved") return;
		const id = window.setTimeout(() => setState("idle"), 2000);
		return () => window.clearTimeout(id);
	}, [state]);
	return { state, error, setState, setError };
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
	return (
		<span className="text-xs text-muted-foreground" aria-live="polite">
			{state === "saving" ? t.common.saving : null}
			{state === "saved" ? <span className="text-status-done">{t.settings.saved}</span> : null}
			{state === "error" && error ? (
				<span role="alert" className="text-destructive">
					{t.settings.saveFailed}: {error}
				</span>
			) : null}
		</span>
	);
}

function ComputerForm({ settings, onSaved }: { settings: Settings | null; onSaved: (s: Settings) => void }) {
	const id = useId();
	const toast = useToast();
	const save = useSaveState();
	const [host, setHost] = useState<string | null>(null);
	const [price, setPrice] = useState<string | null>(null);

	if (!settings) {
		return (
			<div className="space-y-3" aria-busy>
				<Skeleton className="h-8 w-full max-w-sm" />
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-2/3" />
				<Skeleton className="h-4 w-1/2" />
			</div>
		);
	}

	const hostValue = host ?? settings.host_name;
	const priceValue = price ?? String(settings.energy_price_per_kwh);
	const priceNumber = Number(priceValue);
	const priceValid = priceValue.trim() !== "" && Number.isFinite(priceNumber) && priceNumber >= 0;
	const dirty = hostValue !== settings.host_name || priceNumber !== settings.energy_price_per_kwh;

	async function submit() {
		if (!priceValid) return;
		save.setState("saving");
		save.setError(null);
		try {
			const s = await api.settings.update({ host_name: hostValue.trim(), energy_price_per_kwh: priceNumber });
			onSaved(s);
			setHost(null);
			setPrice(null);
			save.setState("saved");
			toast.success(t.toast.settingsSaved);
		} catch (e) {
			save.setState("error");
			save.setError(errorMessage(e));
		}
	}

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div className="space-y-1.5">
				<Label htmlFor={`${id}-host`}>{t.settings.computer.hostLabel}</Label>
				<Input
					id={`${id}-host`}
					value={hostValue}
					onChange={(e) => setHost(e.target.value)}
					placeholder={t.settings.computer.hostPlaceholder}
					className="max-w-sm"
					aria-describedby={`${id}-host-hint`}
				/>
				<p id={`${id}-host-hint`} className="text-xs text-muted-foreground">
					{t.settings.computer.hostHint}
				</p>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor={`${id}-price`}>{t.settings.computer.energyLabel}</Label>
				<div className="flex items-center gap-2">
					<Input
						id={`${id}-price`}
						type="number"
						inputMode="decimal"
						min={0}
						step={0.01}
						value={priceValue}
						onChange={(e) => setPrice(e.target.value)}
						className="tabular w-32"
						aria-invalid={!priceValid}
						aria-describedby={`${id}-price-hint`}
					/>
					<span className="text-sm text-muted-foreground">{t.settings.computer.energyUnit}</span>
				</div>
				<p id={`${id}-price-hint`} className="text-xs text-muted-foreground">
					{t.settings.computer.energyHint}
				</p>
			</div>
			<div className="flex items-center gap-3">
				<Button type="submit" size="sm" disabled={!dirty || !priceValid || save.state === "saving"}>
					{t.settings.computer.save}
				</Button>
				<SaveStatus state={save.state} error={save.error} />
			</div>

			<dl className="grid gap-x-6 gap-y-2 border-t pt-4 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
				<dt className="text-muted-foreground">{t.settings.computer.dataDir}</dt>
				<dd className="break-all select-all">{settings.data_dir}</dd>
				<dt className="text-muted-foreground">{t.settings.computer.envFile}</dt>
				<dd className="break-all select-all">{settings.env_file}</dd>
				<dt className="text-muted-foreground">{t.settings.computer.version}</dt>
				<dd className="flex flex-wrap items-center gap-2">
					<span className="tabular">{settings.version}</span>
					<Badge variant={settings.packaged ? "secondary" : "outline"}>
						{settings.packaged ? t.settings.computer.packaged : t.settings.computer.development}
					</Badge>
				</dd>
			</dl>
		</form>
	);
}

function OllamaUrlForm({ settings, onSaved }: { settings: Settings | null; onSaved: (s: Settings) => void }) {
	const id = useId();
	const save = useSaveState();
	const [url, setUrl] = useState<string | null>(null);
	if (!settings) return <Skeleton className="h-8 w-full max-w-sm" />;
	const value = url ?? settings.ollama_url;
	const dirty = value.trim() !== settings.ollama_url;

	async function submit() {
		save.setState("saving");
		save.setError(null);
		try {
			const s = await api.settings.update({ ollama_url: value.trim() });
			onSaved(s);
			setUrl(null);
			save.setState("saved");
		} catch (e) {
			save.setState("error");
			save.setError(errorMessage(e));
		}
	}

	return (
		<form
			className="space-y-2 py-1"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<Label htmlFor={id}>{t.settings.ollama.urlLabel}</Label>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					id={id}
					value={value}
					onChange={(e) => setUrl(e.target.value)}
					className="max-w-sm"
					spellCheck={false}
					aria-describedby={`${id}-hint`}
				/>
				<Button type="submit" size="sm" variant="outline" disabled={!dirty || save.state === "saving"}>
					{t.common.save}
				</Button>
				<SaveStatus state={save.state} error={save.error} />
			</div>
			<p id={`${id}-hint`} className="text-xs text-muted-foreground">
				{t.settings.ollama.urlHint}
			</p>
		</form>
	);
}

function GpuInfo() {
	const { health, error } = useHealth();
	if (!health) {
		if (error) return <p className="text-sm text-muted-foreground">{t.health.unreachable}</p>;
		return <Skeleton className="h-5 w-64" />;
	}
	const gpu = health.gpu;
	if (!gpu.available) {
		return <p className="text-sm text-status-interrupted">{t.settings.gpu.none}</p>;
	}
	return (
		<div className="text-sm">
			<p className="font-medium">{gpu.name ? t.settings.gpu.detected(gpu.name) : t.health.gpu}</p>
			{gpu.vram_total_mb ? (
				<p className="text-muted-foreground">{t.settings.gpu.vram(fmtMb(gpu.vram_total_mb))}</p>
			) : null}
		</div>
	);
}

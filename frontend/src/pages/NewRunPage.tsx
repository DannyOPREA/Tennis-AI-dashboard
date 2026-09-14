import { AlertTriangleIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/api/client";
import type { Estimate, InputMode, ModelConfig, Target } from "@/api/types";
import { ModeChip, ProviderDot } from "@/components/common/chips";
import { SimpleSelect } from "@/components/common/select";
import { ErrorState, ListSkeleton, PageHeader, SectionTitle } from "@/components/common/states";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { t } from "@/i18n";
import { fmtClock, fmtInt, fmtUsd } from "@/lib/format";
import { useAsync, useDebounced, useDocumentTitle } from "@/lib/hooks";
import { providerLabel } from "@/lib/providers";
import { cn } from "@/lib/utils";

const targetKey = (m: string, mode: InputMode) => `${m}::${mode}`;
const parseKey = (k: string): Target => {
	const [model_config_id, input_mode] = k.split("::");
	return { model_config_id, input_mode: input_mode as InputMode };
};

export function NewRunPage() {
	useDocumentTitle(`${t.newRun.title} – ${t.app.name}`);
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const toast = useToast();

	const videos = useAsync(() => api.videos.list(), []);
	const prompts = useAsync(() => api.prompts.list(), []);
	const models = useAsync(() => api.models.list(), []);
	const presets = useAsync(() => api.framePresets(), []);

	const [videoId, setVideoId] = useState<string | null>(params.get("video"));
	const [promptChoice, setPromptChoice] = useState<string | null>(null);
	const [versionChoice, setVersionChoice] = useState<string | null>(null);
	const [targets, setTargets] = useState<Set<string>>(new Set());
	const [presetChoice, setPresetChoice] = useState<string | null>(null);
	const [repeats, setRepeats] = useState(1);
	const [blind, setBlind] = useState(false);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	// Defaults once data lands: first prompt, its latest version, first preset.
	// Defaults are derived, not stored: first prompt, its latest version, first preset.
	const promptId = promptChoice ?? (prompts.data?.[0] ? String(prompts.data[0].id) : null);
	const prompt = useMemo(() => prompts.data?.find((p) => String(p.id) === promptId) ?? null, [prompts.data, promptId]);
	const versionId = prompt
		? prompt.versions.some((v) => String(v.id) === versionChoice)
			? versionChoice
			: String(prompt.latest_version_id)
		: null;
	const preset = presetChoice ?? presets.data?.[0]?.key ?? null;

	const video = videos.data?.find((v) => String(v.id) === videoId) ?? null;
	const presetObj = presets.data?.find((p) => p.key === preset) ?? null;

	const grouped = useMemo(() => {
		const list = (models.data ?? []).filter((m) => m.enabled);
		return {
			gemini: list.filter((m) => m.provider === "gemini"),
			local: list.filter((m) => m.provider !== "gemini"),
		};
	}, [models.data]);

	function toggle(key: string, on: boolean) {
		setTargets((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});
	}

	const targetList = useMemo(() => Array.from(targets).map(parseKey), [targets]);
	const ready = video !== null && versionId !== null && preset !== null && targetList.length > 0;

	const estimateBody = useMemo(
		() =>
			ready
				? {
						video_id: Number(videoId),
						prompt_version_id: Number(versionId),
						targets: targetList,
						frame_preset: preset as string,
					}
				: null,
		[ready, videoId, versionId, targetList, preset],
	);
	const debouncedBody = useDebounced(estimateBody, 350);
	const estimate = useAsync(async () => (debouncedBody ? api.estimate(debouncedBody) : []), [debouncedBody]);

	async function submit() {
		if (!estimateBody) return;
		setSubmitting(true);
		try {
			const batch = await api.batches.create({
				...estimateBody,
				name: name.trim() || undefined,
				repeats,
				blind,
			});
			toast.success(t.toast.batchCreated);
			navigate(`/batches/${batch.id}`);
		} catch (e) {
			toast.error(errorMessage(e));
			setSubmitting(false);
		}
	}

	async function reloadModels() {
		try {
			const list = await api.models.reload();
			models.setData(list);
			toast.success(t.toast.modelsReloaded);
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	const loadError = videos.error ?? prompts.error ?? models.error ?? presets.error;

	return (
		<>
			<PageHeader title={t.newRun.title} description={t.newRun.description} />
			{loadError ? (
				<ErrorState
					message={loadError}
					className="mb-4"
					onRetry={() => {
						void videos.reload();
						void prompts.reload();
						void models.reload();
						void presets.reload();
					}}
				/>
			) : null}

			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
				<div className="space-y-8">
					{/* Video + prompt */}
					<section className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="nr-video">{t.newRun.video}</Label>
							{videos.data && videos.data.length === 0 ? (
								<p className="text-sm text-muted-foreground">{t.newRun.noVideos}</p>
							) : (
								<div className="flex flex-wrap items-center gap-3">
									<SimpleSelect
										id="nr-video"
										value={videoId}
										onChange={setVideoId}
										placeholder={t.newRun.videoPlaceholder}
										className="min-w-64"
										options={(videos.data ?? []).map((v) => ({
											value: String(v.id),
											label: v.title,
											hint: fmtClock(v.duration_s),
										}))}
									/>
									{video ? (
										<img
											src={api.videos.thumbnailUrl(video.id)}
											alt=""
											className="h-10 w-16 rounded object-cover ring-1 ring-border"
										/>
									) : null}
								</div>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="nr-prompt">{t.newRun.prompt}</Label>
							{prompts.data && prompts.data.length === 0 ? (
								<p className="text-sm text-muted-foreground">{t.newRun.noPrompts}</p>
							) : (
								<SimpleSelect
									id="nr-prompt"
									value={promptId}
									onChange={setPromptChoice}
									placeholder={t.newRun.promptPlaceholder}
									className="w-full"
									options={(prompts.data ?? []).map((p) => ({
										value: String(p.id),
										label: p.name,
									}))}
								/>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="nr-version">{t.newRun.version}</Label>
							<SimpleSelect
								id="nr-version"
								value={versionId}
								onChange={setVersionChoice}
								className="w-full"
								disabled={!prompt}
								options={(prompt?.versions ?? [])
									.slice()
									.sort((a, b) => b.version - a.version)
									.map((v) => ({
										value: String(v.id),
										label: t.prompts.version(v.version),
										hint: v.id === prompt?.latest_version_id ? t.newRun.latest : undefined,
									}))}
							/>
						</div>
					</section>

					{/* Models */}
					<section>
						<SectionTitle
							hint={t.newRun.modelsHint}
							actions={
								<Button variant="ghost" size="sm" onClick={() => void reloadModels()}>
									<RefreshCwIcon data-icon="inline-start" />
									{t.newRun.reloadModels}
								</Button>
							}
						>
							{t.newRun.models}
						</SectionTitle>
						{models.loading && !models.data ? <ListSkeleton rows={4} /> : null}
						{models.data && models.data.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t.newRun.noModels}</p>
						) : null}
						{models.data && models.data.length > 0 ? (
							<div className="grid gap-4 md:grid-cols-2">
								<ModelGroup
									title={t.provider.groupGemini}
									models={grouped.gemini}
									targets={targets}
									onToggle={toggle}
								/>
								<ModelGroup title={t.provider.groupLocal} models={grouped.local} targets={targets} onToggle={toggle} />
							</div>
						) : null}
					</section>

					{/* Options */}
					<section className="grid gap-5 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="nr-preset">{t.newRun.framePreset}</Label>
							<SimpleSelect
								id="nr-preset"
								value={preset}
								onChange={setPresetChoice}
								className="w-full"
								options={(presets.data ?? []).map((p) => ({
									value: p.key,
									label: p.label,
								}))}
							/>
							{presetObj ? (
								<p className="text-xs text-muted-foreground">
									{presetObj.description}{" "}
									{t.newRun.framePresetHint(presetObj.fps, presetObj.long_edge, presetObj.max_frames)}
								</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="nr-repeats">{t.newRun.repeats}</Label>
							<div className="flex items-center gap-3">
								<fieldset id="nr-repeats" className="inline-flex rounded-md border p-0.5">
									<legend className="sr-only">{t.newRun.repeats}</legend>
									{[1, 2, 3, 4, 5].map((n) => (
										<label
											key={n}
											className={cn(
												"tabular grid h-7 w-8 cursor-pointer place-items-center rounded text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-terre",
												repeats === n ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
											)}
										>
											<input
												type="radio"
												name="repeats"
												value={n}
												checked={repeats === n}
												onChange={() => setRepeats(n)}
												className="sr-only"
											/>
											{n}
										</label>
									))}
								</fieldset>
							</div>
							<p className="text-xs text-muted-foreground">{t.newRun.repeatsHint}</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="nr-name">{t.newRun.batchName}</Label>
							<Input
								id="nr-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t.newRun.batchNamePlaceholder}
							/>
						</div>
						<div className="flex items-start gap-3 pt-1 sm:pt-6">
							<Switch id="nr-blind" checked={blind} onCheckedChange={setBlind} />
							<div>
								<Label htmlFor="nr-blind">{t.newRun.blind}</Label>
								<p className="text-xs text-muted-foreground">{t.newRun.blindHint}</p>
							</div>
						</div>
					</section>
				</div>

				{/* Estimate */}
				<aside className="lg:sticky lg:top-6 lg:self-start">
					<SectionTitle hint={t.newRun.estimateHint}>{t.newRun.estimate}</SectionTitle>
					<div className="rounded-xl border bg-card">
						{!ready ? (
							<p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.newRun.estimateEmpty}</p>
						) : (
							<EstimateTable
								rows={estimate.data ?? []}
								loading={estimate.loading || estimate.refreshing}
								error={estimate.error}
								models={models.data ?? []}
								repeats={repeats}
							/>
						)}
						<div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
							<span className="text-xs text-muted-foreground">
								{targetList.length > 0
									? `${t.newRun.targets(targetList.length)}, ${t.newRun.runsPlanned(targetList.length * repeats)}`
									: t.newRun.needTargets}
							</span>
							<Button onClick={() => void submit()} disabled={!ready || submitting}>
								<PlayIcon data-icon="inline-start" />
								{submitting ? t.newRun.starting : t.newRun.start}
							</Button>
						</div>
					</div>
				</aside>
			</div>
		</>
	);
}

function ModelGroup({
	title,
	models,
	targets,
	onToggle,
}: {
	title: string;
	models: ModelConfig[];
	targets: Set<string>;
	onToggle: (key: string, on: boolean) => void;
}) {
	return (
		<div className="rounded-xl border bg-card">
			<div className="border-b px-3 py-2 text-sm font-medium">{title}</div>
			{models.length === 0 ? (
				<p className="px-3 py-3 text-xs text-muted-foreground">{t.common.none}</p>
			) : (
				<ul className="divide-y">
					{models.map((m) => {
						const modes: InputMode[] = m.input_modes;
						const unavailable = !m.availability.available;
						return (
							<li key={m.id} className={cn("px-3 py-2.5", unavailable && "opacity-70")}>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2 text-sm font-medium">
											<ProviderDot provider={m.provider} />
											<span className="truncate">{m.display_name}</span>
										</div>
										<div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
											<span className="truncate">{m.model_id}</span>
											<span>{t.newRun.tokensPerFrame(m.tokens_per_frame)}</span>
											{m.max_images !== null ? <span>{t.newRun.maxImages(m.max_images)}</span> : null}
											{m.vram_note ? <span>{m.vram_note}</span> : null}
										</div>
										{unavailable ? (
											<div className="mt-1 flex items-center gap-1 text-xs text-status-interrupted">
												<AlertTriangleIcon aria-hidden className="size-3" />
												{t.newRun.unavailable}
												{m.availability.reason ? `: ${m.availability.reason}` : ""}
											</div>
										) : null}
									</div>
									<div className="flex shrink-0 flex-col gap-1.5">
										{modes.map((mode) => {
											const key = targetKey(m.id, mode);
											const id = `tgt-${key.replace(/[^a-z0-9]/gi, "-")}`;
											return (
												<label key={mode} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs">
													<Checkbox
														id={id}
														checked={targets.has(key)}
														onCheckedChange={(on) => onToggle(key, on)}
														disabled={unavailable}
													/>
													{mode === "native_video" ? t.inputMode.native_video : t.inputMode.frames}
												</label>
											);
										})}
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function EstimateTable({
	rows,
	loading,
	error,
	models,
	repeats,
}: {
	rows: Estimate[];
	loading: boolean;
	error: string | null;
	models: ModelConfig[];
	repeats: number;
}) {
	const nameOf = (id: string) => models.find((m) => m.id === id)?.display_name ?? id;
	const provOf = (id: string) => models.find((m) => m.id === id)?.provider ?? "";
	const totalCost = rows.reduce((a, r) => a + r.est_cost_usd, 0) * repeats;
	const totalTokens = rows.reduce((a, r) => a + r.est_tokens_in, 0) * repeats;
	return (
		<div className={cn("transition-opacity", loading && "opacity-60")} aria-busy={loading}>
			{error ? (
				<p role="alert" className="px-4 py-3 text-sm text-destructive">
					{error}
				</p>
			) : null}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t.newRun.colModel}</TableHead>
						<TableHead className="text-right">{t.newRun.colFrames}</TableHead>
						<TableHead className="text-right">{t.newRun.colTokens}</TableHead>
						<TableHead className="text-right">{t.newRun.colCost}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 && loading ? (
						<TableRow>
							<TableCell colSpan={4} className="text-center text-muted-foreground">
								{t.newRun.estimating}
							</TableCell>
						</TableRow>
					) : null}
					{rows.map((r) => (
						<TableRow key={`${r.model_config_id}-${r.input_mode}`}>
							<TableCell>
								<div className="flex items-center gap-2">
									<ProviderDot provider={provOf(r.model_config_id)} />
									<span className="truncate" title={providerLabel(provOf(r.model_config_id))}>
										{nameOf(r.model_config_id)}
									</span>
									<ModeChip mode={r.input_mode} />
								</div>
								{r.warnings.length > 0 ? (
									<ul className="mt-1 space-y-0.5 text-xs text-status-interrupted">
										{r.warnings.map((w) => (
											<li key={w} className="flex items-start gap-1">
												<AlertTriangleIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
												{w}
											</li>
										))}
									</ul>
								) : null}
							</TableCell>
							<TableCell className="tabular text-right">
								{r.input_mode === "native_video" ? "—" : fmtInt(r.frames)}
							</TableCell>
							<TableCell className="tabular text-right">{fmtInt(r.est_tokens_in)}</TableCell>
							<TableCell className="tabular text-right">
								{fmtUsd(r.est_cost_usd)}
								<span className={cn("ml-1 text-[10px]", r.exact ? "text-status-done" : "text-muted-foreground")}>
									{r.exact ? t.newRun.exact : t.newRun.approx}
								</span>
							</TableCell>
						</TableRow>
					))}
					{rows.length > 0 ? (
						<TableRow className="font-medium">
							<TableCell>
								{t.newRun.total}
								{repeats > 1 ? (
									<span className="ml-1 text-xs font-normal text-muted-foreground">×{repeats}</span>
								) : null}
							</TableCell>
							<TableCell />
							<TableCell className="tabular text-right">{fmtInt(totalTokens)}</TableCell>
							<TableCell className="tabular text-right">{fmtUsd(totalCost)}</TableCell>
						</TableRow>
					) : null}
				</TableBody>
			</Table>
		</div>
	);
}

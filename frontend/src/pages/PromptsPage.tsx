import { MessageSquareTextIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "@/api/client";
import type { OutputLanguage, Prompt, PromptVersion } from "@/api/types";
import { SimpleSelect } from "@/components/common/select";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Editor = { mode: "create" } | { mode: "version"; prompt: Prompt } | null;

export function PromptsPage() {
	useDocumentTitle(`${t.prompts.title} – ${t.app.name}`);
	const prompts = useAsync(() => api.prompts.list(), []);
	const toast = useToast();
	const [editor, setEditor] = useState<Editor>(null);
	const [selected, setSelected] = useState<Record<number, number>>({}); // promptId -> versionId being viewed

	function upsert(p: Prompt) {
		prompts.setData((list) => {
			const xs = list ?? [];
			return xs.some((x) => x.id === p.id) ? xs.map((x) => (x.id === p.id ? p : x)) : [p, ...xs];
		});
	}

	return (
		<>
			<PageHeader
				title={t.prompts.title}
				description={t.prompts.description}
				actions={
					<Button onClick={() => setEditor({ mode: "create" })}>
						<PlusIcon data-icon="inline-start" />
						{t.prompts.create}
					</Button>
				}
			/>
			{prompts.error && !prompts.data ? (
				<ErrorState message={prompts.error} onRetry={() => void prompts.reload()} />
			) : null}
			{prompts.loading && !prompts.data ? <ListSkeleton rows={4} /> : null}
			{prompts.data && prompts.data.length === 0 ? (
				<EmptyState
					icon={MessageSquareTextIcon}
					title={t.prompts.empty}
					hint={t.prompts.emptyHint}
					action={
						<Button variant="outline" onClick={() => setEditor({ mode: "create" })}>
							{t.prompts.create}
						</Button>
					}
				/>
			) : null}
			{prompts.data && prompts.data.length > 0 ? (
				<div className="space-y-4">
					{prompts.data.map((p) => {
						const versions = p.versions.slice().sort((a, b) => b.version - a.version);
						const viewId = selected[p.id] ?? p.latest_version_id;
						const view = versions.find((v) => v.id === viewId) ?? versions[0];
						const runs = p.versions.reduce((a, v) => a + v.run_count, 0);
						return (
							<article key={p.id} className="rounded-xl border bg-card">
								<header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
									<div className="min-w-0">
										<h2 className="font-heading text-base font-semibold">{p.name}</h2>
										<p className="text-xs text-muted-foreground">
											{t.common.versions(p.versions.length)}, {t.prompts.runCount(runs)}
											{p.notes ? <span className="ml-2 text-foreground/80">{p.notes}</span> : null}
										</p>
									</div>
									<Button variant="outline" size="sm" onClick={() => setEditor({ mode: "version", prompt: p })}>
										<PlusIcon data-icon="inline-start" />
										{t.prompts.newVersion}
									</Button>
								</header>
								<div className="grid md:grid-cols-[180px_1fr]">
									<ul className="border-b md:border-r md:border-b-0">
										{versions.map((v) => (
											<li key={v.id}>
												<button
													type="button"
													onClick={() => setSelected((s) => ({ ...s, [p.id]: v.id }))}
													aria-current={view?.id === v.id}
													className={cn(
														"flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-secondary/60",
														view?.id === v.id && "bg-secondary font-medium",
													)}
												>
													<span>
														{t.prompts.version(v.version)}
														{v.id === p.latest_version_id ? (
															<span className="ml-1.5 text-[10px] text-terre">{t.prompts.latest}</span>
														) : null}
													</span>
													<span className="tabular text-xs text-muted-foreground">{v.run_count}</span>
												</button>
											</li>
										))}
									</ul>
									{view ? <VersionView v={view} /> : null}
								</div>
							</article>
						);
					})}
				</div>
			) : null}

			<PromptEditor
				editor={editor}
				onClose={() => setEditor(null)}
				onSaved={(p, created) => {
					upsert(p);
					setSelected((s) => ({ ...s, [p.id]: p.latest_version_id }));
					setEditor(null);
					toast.success(created ? t.toast.promptCreated : t.toast.versionCreated);
				}}
			/>
		</>
	);
}

function VersionView({ v, muted }: { v: PromptVersion; muted?: boolean }) {
	return (
		<div className={cn("space-y-3 p-4", muted && "text-muted-foreground")}>
			<div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
				<span>
					{t.prompts.created} {fmtDate(v.created_at)}
				</span>
				<span>{v.output_language === "fr" ? t.prompts.fr : t.prompts.en}</span>
				<span>{t.prompts.runCount(v.run_count)}</span>
			</div>
			<div>
				<div className="mb-1 text-xs font-medium">{t.prompts.systemText}</div>
				<pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-3 font-sans text-sm whitespace-pre-wrap">
					{v.system_text || t.common.none}
				</pre>
			</div>
			<div>
				<div className="mb-1 text-xs font-medium">{t.prompts.userText}</div>
				<pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-3 font-sans text-sm whitespace-pre-wrap">
					{v.user_text || t.common.none}
				</pre>
			</div>
		</div>
	);
}

function PromptEditor({
	editor,
	onClose,
	onSaved,
}: {
	editor: Editor;
	onClose: () => void;
	onSaved: (p: Prompt, created: boolean) => void;
}) {
	const [name, setName] = useState("");
	const [notes, setNotes] = useState("");
	const [systemText, setSystemText] = useState("");
	const [userText, setUserText] = useState("");
	const [lang, setLang] = useState<OutputLanguage>("fr");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [seeded, setSeeded] = useState<string | null>(null);

	const previous: PromptVersion | null =
		editor?.mode === "version"
			? (editor.prompt.versions.find((v) => v.id === editor.prompt.latest_version_id) ?? null)
			: null;

	// Seed the form when the editor opens (create: blank; version: copy of latest).
	const seedKey = editor ? (editor.mode === "create" ? "create" : `version-${editor.prompt.id}`) : null;
	if (seedKey !== seeded) {
		setSeeded(seedKey);
		setErr(null);
		if (editor?.mode === "version" && previous) {
			setName(editor.prompt.name);
			setNotes(editor.prompt.notes);
			setSystemText(previous.system_text);
			setUserText(previous.user_text);
			setLang(previous.output_language);
		} else {
			setName("");
			setNotes("");
			setSystemText("");
			setUserText("");
			setLang("fr");
		}
	}

	const unchanged =
		editor?.mode === "version" && previous
			? previous.system_text === systemText && previous.user_text === userText && previous.output_language === lang
			: false;

	async function save() {
		if (!editor) return;
		if (!systemText.trim() || !userText.trim() || (editor.mode === "create" && !name.trim())) {
			setErr(t.prompts.required);
			return;
		}
		if (unchanged) {
			setErr(t.prompts.unchanged);
			return;
		}
		setBusy(true);
		setErr(null);
		try {
			if (editor.mode === "create") {
				const p = await api.prompts.create({
					name: name.trim(),
					notes: notes.trim() || undefined,
					system_text: systemText,
					user_text: userText,
					output_language: lang,
				});
				onSaved(p, true);
			} else {
				const p = await api.prompts.addVersion(editor.prompt.id, {
					system_text: systemText,
					user_text: userText,
					output_language: lang,
				});
				onSaved(p, false);
			}
		} catch (e) {
			setErr(errorMessage(e));
		} finally {
			setBusy(false);
		}
	}

	const wide = editor?.mode === "version";

	return (
		<Dialog open={editor !== null} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className={cn("max-h-[90dvh] overflow-y-auto", wide ? "sm:max-w-4xl" : "sm:max-w-xl")}>
				<DialogHeader>
					<DialogTitle>
						{editor?.mode === "version"
							? t.prompts.editorTitleVersion(editor.prompt.name)
							: t.prompts.editorTitleCreate}
					</DialogTitle>
					<DialogDescription>{t.prompts.description}</DialogDescription>
				</DialogHeader>
				<form
					className={cn("grid gap-6", wide && "md:grid-cols-2")}
					onSubmit={(e) => {
						e.preventDefault();
						void save();
					}}
				>
					<div className="space-y-3">
						{editor?.mode === "create" ? (
							<>
								<div className="space-y-1.5">
									<Label htmlFor="pr-name">{t.prompts.name}</Label>
									<Input
										id="pr-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder={t.prompts.namePlaceholder}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="pr-notes">{t.prompts.notes}</Label>
									<Input
										id="pr-notes"
										value={notes}
										onChange={(e) => setNotes(e.target.value)}
										placeholder={t.prompts.notesPlaceholder}
									/>
								</div>
							</>
						) : null}
						<div className="space-y-1.5">
							<Label htmlFor="pr-lang">{t.prompts.outputLanguage}</Label>
							<SimpleSelect
								id="pr-lang"
								value={lang}
								onChange={(v) => setLang(v as OutputLanguage)}
								options={[
									{ value: "fr", label: t.prompts.fr },
									{ value: "en", label: t.prompts.en },
								]}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="pr-system">{t.prompts.systemText}</Label>
							<Textarea
								id="pr-system"
								rows={7}
								value={systemText}
								onChange={(e) => setSystemText(e.target.value)}
								placeholder={t.prompts.systemPlaceholder}
								className="font-sans text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="pr-user">{t.prompts.userText}</Label>
							<Textarea
								id="pr-user"
								rows={7}
								value={userText}
								onChange={(e) => setUserText(e.target.value)}
								placeholder={t.prompts.userPlaceholder}
								className="font-sans text-sm"
							/>
						</div>
					</div>
					{wide ? (
						<div className="rounded-lg border bg-muted/30">
							<div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
								{t.prompts.previous}
								{previous ? ` (${t.prompts.version(previous.version).toLowerCase()})` : ""}
							</div>
							{previous ? (
								<VersionView v={previous} muted />
							) : (
								<p className="p-4 text-sm text-muted-foreground">{t.prompts.previousEmpty}</p>
							)}
						</div>
					) : null}
					<DialogFooter className={cn(wide && "md:col-span-2")}>
						{err ? (
							<p role="alert" className="mr-auto self-center text-sm text-destructive">
								{err}
							</p>
						) : null}
						<Button type="button" variant="ghost" onClick={onClose}>
							{t.common.cancel}
						</Button>
						<Button type="submit" disabled={busy}>
							{busy ? t.common.saving : editor?.mode === "create" ? t.prompts.saveCreate : t.prompts.saveVersion}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

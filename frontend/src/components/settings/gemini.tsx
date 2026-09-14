import { CircleAlertIcon, CircleCheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";
import { api, errorMessage } from "@/api/client";
import type { GeminiTestResult, Settings } from "@/api/types";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

type TestState =
	| { kind: "idle" }
	| { kind: "testing" }
	| { kind: "result"; result: GeminiTestResult; error?: undefined };

/**
 * Password-style key field with Save, Remove and Test connection. Used on the
 * Settings page and in step 1 of the welcome flow.
 */
export function GeminiKeyField({
	settings,
	onSaved,
	hideHint,
}: {
	settings: Settings | null;
	/** Called with the fresh settings after a save or a removal. */
	onSaved: (s: Settings) => void;
	hideHint?: boolean;
}) {
	const id = useId();
	const toast = useToast();
	const [key, setKey] = useState("");
	const [show, setShow] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [test, setTest] = useState<TestState>({ kind: "idle" });
	const [testError, setTestError] = useState<string | null>(null);
	const typed = key.trim();
	const keySet = settings?.gemini_key_set ?? false;

	async function save(value: string) {
		setSaving(true);
		setSaveError(null);
		try {
			const s = await api.settings.update({ gemini_api_key: value });
			onSaved(s);
			setKey("");
			setTest({ kind: "idle" });
			toast.success(value ? t.toast.keySaved : t.toast.keyCleared);
		} catch (e) {
			setSaveError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	async function runTest() {
		if (!typed && !keySet) {
			setTestError(t.settings.gemini.nothingToTest);
			return;
		}
		setTestError(null);
		setTest({ kind: "testing" });
		try {
			const result = await api.settings.testGemini(typed || undefined);
			setTest({ kind: "result", result });
		} catch (e) {
			setTest({ kind: "idle" });
			setTestError(errorMessage(e));
		}
	}

	if (!settings) {
		return (
			<div className="space-y-2" aria-busy>
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-full max-w-md" />
				<Skeleton className="h-7 w-48" />
			</div>
		);
	}

	return (
		<form
			className="space-y-3"
			onSubmit={(e) => {
				e.preventDefault();
				if (typed) void save(typed);
			}}
		>
			{!hideHint ? <p className="text-sm text-muted-foreground">{t.settings.gemini.hint}</p> : null}
			<div className="space-y-1.5">
				<Label htmlFor={id}>{t.settings.gemini.keyLabel}</Label>
				<div className="flex max-w-md items-center gap-1.5">
					<Input
						id={id}
						type={show ? "text" : "password"}
						autoComplete="off"
						spellCheck={false}
						value={key}
						onChange={(e) => {
							setKey(e.target.value);
							setTestError(null);
							if (test.kind === "result") setTest({ kind: "idle" });
						}}
						placeholder={
							keySet && settings.gemini_key_hint
								? t.settings.gemini.keySavedPlaceholder(settings.gemini_key_hint)
								: t.settings.gemini.keyPlaceholder
						}
						aria-describedby={`${id}-note`}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={show ? t.settings.gemini.hideKey : t.settings.gemini.showKey}
						aria-pressed={show}
						onClick={() => setShow((s) => !s)}
					>
						{show ? <EyeOffIcon /> : <EyeIcon />}
					</Button>
				</div>
				<p id={`${id}-note`} className="text-xs text-muted-foreground">
					{keySet && settings.gemini_key_hint
						? t.settings.gemini.keySavedNote(settings.gemini_key_hint)
						: t.settings.gemini.noKey}
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" size="sm" disabled={!typed || saving}>
					{saving ? t.common.saving : t.settings.gemini.save}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => void runTest()}
					disabled={test.kind === "testing" || saving}
				>
					{test.kind === "testing" ? t.settings.gemini.testing : t.settings.gemini.test}
				</Button>
				{keySet ? (
					<Button type="button" size="sm" variant="ghost" onClick={() => void save("")} disabled={saving}>
						{t.settings.gemini.clear}
					</Button>
				) : null}
			</div>

			<div aria-live="polite" className="min-h-5 text-sm">
				{test.kind === "result" ? <TestResultLine result={test.result} /> : null}
				{testError ? (
					<p role="alert" className="flex items-start gap-1.5 text-destructive">
						<CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
						<span>{testError}</span>
					</p>
				) : null}
				{saveError ? (
					<p role="alert" className="text-destructive">
						{t.settings.saveFailed}: {saveError}
					</p>
				) : null}
			</div>
		</form>
	);
}

function TestResultLine({ result }: { result: GeminiTestResult }) {
	if (result.ok) {
		return (
			<p className="flex items-start gap-1.5 text-status-done" role="status">
				<CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
				<span>
					{t.settings.gemini.testOk(result.models.length)}
					{result.models.length > 0 ? (
						<span className="ml-2 text-xs text-muted-foreground">{result.models.join(", ")}</span>
					) : null}
				</span>
			</p>
		);
	}
	return (
		<p className="flex items-start gap-1.5 text-destructive" role="alert">
			<CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
			<span>
				<span className="font-medium">{t.settings.gemini.testFailed}.</span> {result.message}
			</span>
		</p>
	);
}

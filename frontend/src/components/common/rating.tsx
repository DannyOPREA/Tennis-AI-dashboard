import { StarIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api, errorMessage } from "@/api/client";
import type { Rating } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Stars({
	value,
	onChange,
	size = "md",
	readOnly,
	className,
}: {
	value: number;
	onChange?: (n: number) => void;
	size?: "sm" | "md";
	readOnly?: boolean;
	className?: string;
}) {
	const [hover, setHover] = useState(0);
	const groupName = useId();
	const shown = hover || value;
	const dim = size === "sm" ? "size-3.5" : "size-5";
	const starAt = (n: number) => (
		<StarIcon
			aria-hidden
			className={cn(dim, "transition-colors", n <= shown ? "fill-terre text-terre" : "text-border")}
		/>
	);
	if (readOnly) {
		return (
			<span role="img" aria-label={t.rating.stars(value)} className={cn("inline-flex items-center", className)}>
				{[1, 2, 3, 4, 5].map((n) => (
					<span key={n}>{starAt(n)}</span>
				))}
			</span>
		);
	}
	return (
		<fieldset
			className={cn("inline-flex items-center gap-0.5 border-0 p-0", className)}
			onMouseLeave={() => setHover(0)}
		>
			<legend className="sr-only">{t.rating.stars(value)}</legend>
			{[1, 2, 3, 4, 5].map((n) => (
				<label
					key={n}
					className="cursor-pointer rounded p-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-terre"
					onMouseEnter={() => setHover(n)}
				>
					<input
						type="radio"
						name={groupName}
						value={n}
						checked={value === n}
						onChange={() => onChange?.(n)}
						onFocus={() => setHover(n)}
						onBlur={() => setHover(0)}
						className="sr-only"
						aria-label={t.rating.setStars(n)}
					/>
					{starAt(n)}
				</label>
			))}
		</fieldset>
	);
}

/**
 * Stars + notes, upserting PUT /api/runs/{id}/rating.
 * Stars save immediately; notes save on the button or on blur when dirty.
 */
export function RatingWidget({
	runId,
	rating,
	onSaved,
	compact,
}: {
	runId: number;
	rating: Rating | null;
	onSaved?: (r: Rating | null) => void;
	compact?: boolean;
}) {
	const [stars, setStars] = useState(rating?.stars ?? 0);
	const [notes, setNotes] = useState(rating?.notes ?? "");
	const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		setStars(rating?.stars ?? 0);
		setNotes(rating?.notes ?? "");
	}, [rating]);

	const dirty = stars !== (rating?.stars ?? 0) || notes !== (rating?.notes ?? "");

	async function save(nextStars = stars, nextNotes = notes) {
		if (nextStars < 1) return;
		setState("saving");
		setErr(null);
		try {
			const saved = await api.runs.rate(runId, {
				stars: nextStars,
				notes: nextNotes,
			});
			setState("saved");
			onSaved?.(saved);
			window.setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2000);
		} catch (e) {
			setState("error");
			setErr(errorMessage(e));
		}
	}

	async function clear() {
		setState("saving");
		try {
			await api.runs.unrate(runId);
			setStars(0);
			setNotes("");
			setState("idle");
			onSaved?.(null);
		} catch (e) {
			setState("error");
			setErr(errorMessage(e));
		}
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Stars
					value={stars}
					onChange={(n) => {
						setStars(n);
						void save(n, notes);
					}}
				/>
				<span className="text-xs text-muted-foreground" aria-live="polite">
					{state === "saving"
						? t.common.saving
						: state === "saved"
							? t.rating.saved
							: rating
								? t.rating.ratedAt(fmtRelative(rating.updated_at))
								: t.rating.unrated}
				</span>
			</div>
			<Textarea
				value={notes}
				onChange={(e) => setNotes(e.target.value)}
				placeholder={t.rating.notesPlaceholder}
				rows={compact ? 2 : 4}
				className="resize-y text-sm"
				aria-label={t.prompts.notes}
			/>
			{err ? (
				<p role="alert" className="text-xs text-destructive">
					{err}
				</p>
			) : null}
			<div className="flex items-center justify-between gap-2">
				<Button size="sm" onClick={() => void save()} disabled={stars < 1 || !dirty || state === "saving"}>
					{t.rating.save}
				</Button>
				{rating ? (
					<Button size="sm" variant="ghost" onClick={() => void clear()} disabled={state === "saving"}>
						{t.rating.clear}
					</Button>
				) : null}
			</div>
		</div>
	);
}

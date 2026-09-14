import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function MarkdownOutput({
	text,
	streaming,
	className,
}: {
	text: string;
	streaming?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("prose-output", className)}>
			<Markdown>{text}</Markdown>
			{streaming ? (
				<span
					aria-hidden
					className="live-dot ml-1 inline-block h-[1em] w-0.5 translate-y-[2px] bg-terre align-baseline"
				/>
			) : null}
		</div>
	);
}

/** Native <details> collapsible with a consistent header. */
export function Disclosure({
	title,
	children,
	defaultOpen,
	className,
}: {
	title: ReactNode;
	children: ReactNode;
	defaultOpen?: boolean;
	className?: string;
}) {
	return (
		<details className={cn("group rounded-lg border bg-card", className)} open={defaultOpen}>
			<summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
				<ChevronRightIcon
					aria-hidden
					className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
				/>
				{title}
			</summary>
			<div className="border-t px-3 py-2">{children}</div>
		</details>
	);
}

export function JsonPanel({ title, value }: { title: ReactNode; value: unknown }) {
	const empty =
		value === null || value === undefined || (typeof value === "object" && Object.keys(value as object).length === 0);
	return (
		<Disclosure title={title}>
			{empty ? (
				<p className="text-xs text-muted-foreground">{t.common.none}</p>
			) : (
				<pre className="max-h-80 overflow-auto font-mono text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
			)}
		</Disclosure>
	);
}

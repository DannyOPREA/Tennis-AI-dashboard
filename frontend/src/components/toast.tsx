import { XIcon } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type ToastKind = "info" | "success" | "error";
type Toast = { id: number; kind: ToastKind; text: string };

type ToastApi = {
	toast: (text: string, kind?: ToastKind) => void;
	error: (text: string) => void;
	success: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<Toast[]>([]);
	const seq = useRef(0);

	const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

	const toast = useCallback(
		(text: string, kind: ToastKind = "info") => {
			const id = ++seq.current;
			setItems((xs) => [...xs.slice(-3), { id, kind, text }]);
			window.setTimeout(() => remove(id), kind === "error" ? 8000 : 3500);
		},
		[remove],
	);

	const api = useMemo<ToastApi>(
		() => ({
			toast,
			error: (s) => toast(s, "error"),
			success: (s) => toast(s, "success"),
		}),
		[toast],
	);

	return (
		<ToastContext.Provider value={api}>
			{children}
			<div
				aria-live="polite"
				className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
			>
				{items.map((it) => (
					<div
						key={it.id}
						role={it.kind === "error" ? "alert" : "status"}
						className={cn(
							"pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card px-3.5 py-2.5 text-sm shadow-md",
							it.kind === "error" && "border-destructive/40",
							it.kind === "success" && "border-status-done/40",
						)}
					>
						<span
							aria-hidden
							className={cn(
								"mt-1.5 size-2 shrink-0 rounded-full",
								it.kind === "error"
									? "bg-destructive"
									: it.kind === "success"
										? "bg-status-done"
										: "bg-muted-foreground",
							)}
						/>
						<span className="flex-1 leading-snug">{it.text}</span>
						<button
							type="button"
							onClick={() => remove(it.id)}
							aria-label={t.common.dismiss}
							className="-mr-1 rounded p-1 text-muted-foreground hover:text-foreground"
						>
							<XIcon className="size-3.5" />
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast(): ToastApi {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}

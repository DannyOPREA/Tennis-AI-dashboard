import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Option = {
	value: string;
	label: string;
	disabled?: boolean;
	hint?: ReactNode;
};

/** Single-value select over a flat option list. Values are strings; map ids yourself. */
export function SimpleSelect({
	value,
	onChange,
	options,
	placeholder,
	id,
	className,
	disabled,
	size,
}: {
	value: string | null;
	onChange: (v: string) => void;
	options: Option[];
	placeholder?: string;
	id?: string;
	className?: string;
	disabled?: boolean;
	size?: "sm" | "default";
}) {
	const items = options.map((o) => ({ value: o.value, label: o.label }));
	return (
		<Select
			value={value}
			onValueChange={(v) => {
				if (typeof v === "string") onChange(v);
			}}
			items={items}
			disabled={disabled}
		>
			<SelectTrigger id={id} className={className} size={size}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value} disabled={o.disabled}>
						<span className="flex items-center gap-2">
							{o.label}
							{o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

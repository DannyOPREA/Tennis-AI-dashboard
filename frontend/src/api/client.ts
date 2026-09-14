import type {
	ApiErrorBody,
	Batch,
	BatchSummary,
	CreateBatchBody,
	CreatePromptBody,
	DashboardFilters,
	DashboardQuery,
	Estimate,
	EstimateBody,
	FramePreset,
	Health,
	ModelConfig,
	NewPromptVersionBody,
	PointRow,
	Prompt,
	Rating,
	RatingBody,
	Run,
	RunFrames,
	RunStatus,
	SummaryRow,
	Video,
} from "./types";

export const API_BASE = "/api";

export class ApiError extends Error {
	status: number;
	detail: string;
	constructor(status: number, detail: string) {
		super(detail);
		this.name = "ApiError";
		this.status = status;
		this.detail = detail;
	}
}

async function parseError(res: Response): Promise<ApiError> {
	let detail = `${res.status} ${res.statusText}`;
	try {
		const body = (await res.json()) as Partial<ApiErrorBody>;
		if (body && typeof body.detail === "string") detail = body.detail;
		else if (body?.detail) detail = JSON.stringify(body.detail);
	} catch {
		// non-JSON error body; keep the status text
	}
	return new ApiError(res.status, detail);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${API_BASE}${path}`, {
			...init,
			headers: {
				Accept: "application/json",
				...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
				...(init.headers ?? {}),
			},
		});
	} catch (e) {
		throw new ApiError(0, e instanceof Error ? e.message : "Network error");
	}
	if (!res.ok) throw await parseError(res);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null || v === "") continue;
		sp.set(k, String(v));
	}
	const s = sp.toString();
	return s ? `?${s}` : "";
}

export const api = {
	health: () => request<Health>("/health"),

	videos: {
		list: () => request<Video[]>("/videos"),
		get: (id: number) => request<Video>(`/videos/${id}`),
		patch: (id: number, body: { title?: string; tags?: string[] }) =>
			request<Video>(`/videos/${id}`, { method: "PATCH", body: json(body) }),
		remove: (id: number) => request<void>(`/videos/${id}`, { method: "DELETE" }),
		fileUrl: (id: number) => `${API_BASE}/videos/${id}/file`,
		thumbnailUrl: (id: number) => `${API_BASE}/videos/${id}/thumbnail`,
	},

	prompts: {
		list: () => request<Prompt[]>("/prompts"),
		create: (body: CreatePromptBody) => request<Prompt>("/prompts", { method: "POST", body: json(body) }),
		patch: (id: number, body: { name?: string; notes?: string }) =>
			request<Prompt>(`/prompts/${id}`, { method: "PATCH", body: json(body) }),
		addVersion: (id: number, body: NewPromptVersionBody) =>
			request<Prompt>(`/prompts/${id}/versions`, {
				method: "POST",
				body: json(body),
			}),
	},

	models: {
		list: () => request<ModelConfig[]>("/models"),
		reload: () => request<ModelConfig[]>("/models/reload", { method: "POST" }),
	},

	framePresets: () => request<FramePreset[]>("/frame-presets"),

	estimate: (body: EstimateBody) => request<Estimate[]>("/estimate", { method: "POST", body: json(body) }),

	batches: {
		create: (body: CreateBatchBody) => request<Batch>("/batches", { method: "POST", body: json(body) }),
		list: (limit = 50) => request<BatchSummary[]>(`/batches${qs({ limit })}`),
		get: (id: number) => request<Batch>(`/batches/${id}`),
		exportUrl: (id: number) => `${API_BASE}/batches/${id}/export`,
	},

	runs: {
		list: (params: { video_id?: number; model_config_id?: string; status?: RunStatus; limit?: number } = {}) =>
			request<Run[]>(`/runs${qs(params)}`),
		get: (id: number) => request<Run>(`/runs/${id}`),
		cancel: (id: number) => request<Run>(`/runs/${id}/cancel`, { method: "POST" }),
		retry: (id: number) => request<Run>(`/runs/${id}/retry`, { method: "POST" }),
		frames: (id: number) => request<RunFrames>(`/runs/${id}/frames`),
		frameUrl: (id: number, index: number) => `${API_BASE}/runs/${id}/frames/${index}`,
		contactSheetUrl: (id: number) => `${API_BASE}/runs/${id}/contact-sheet`,
		eventsUrl: (id: number) => `${API_BASE}/runs/${id}/events`,
		rate: (id: number, body: RatingBody) =>
			request<Rating>(`/runs/${id}/rating`, {
				method: "PUT",
				body: json(body),
			}),
		unrate: (id: number, rater = "client") => request<void>(`/runs/${id}/rating${qs({ rater })}`, { method: "DELETE" }),
	},

	dashboard: {
		filters: () => request<DashboardFilters>("/dashboard/filters"),
		summary: (q: DashboardQuery) => request<SummaryRow[]>(`/dashboard/summary${qs(q)}`),
		runs: (q: DashboardQuery) => request<PointRow[]>(`/dashboard/runs${qs(q)}`),
	},

	globalEventsUrl: () => `${API_BASE}/events`,
};

/** Upload a video with progress (XHR, because fetch has no upload progress). */
export function uploadVideo(
	file: File,
	opts: {
		title?: string;
		tags?: string;
		onProgress?: (fraction: number) => void;
		signal?: AbortSignal;
	} = {},
): Promise<Video> {
	return new Promise((resolve, reject) => {
		const fd = new FormData();
		fd.append("file", file);
		if (opts.title) fd.append("title", opts.title);
		if (opts.tags) fd.append("tags", opts.tags);

		const xhr = new XMLHttpRequest();
		xhr.open("POST", `${API_BASE}/videos`);
		xhr.setRequestHeader("Accept", "application/json");
		xhr.upload.onprogress = (ev) => {
			if (ev.lengthComputable && opts.onProgress) opts.onProgress(ev.loaded / ev.total);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					resolve(JSON.parse(xhr.responseText) as Video);
				} catch {
					reject(new ApiError(xhr.status, "Unreadable response from server"));
				}
			} else {
				let detail = `${xhr.status} ${xhr.statusText}`;
				try {
					const body = JSON.parse(xhr.responseText) as Partial<ApiErrorBody>;
					if (typeof body.detail === "string") detail = body.detail;
				} catch {
					// keep status text
				}
				reject(new ApiError(xhr.status, detail));
			}
		};
		xhr.onerror = () => reject(new ApiError(0, "Network error during upload"));
		xhr.onabort = () => reject(new ApiError(0, "Upload cancelled"));
		if (opts.signal) opts.signal.addEventListener("abort", () => xhr.abort());
		xhr.send(fd);
	});
}

export function errorMessage(e: unknown): string {
	if (e instanceof ApiError) return e.detail;
	if (e instanceof Error) return e.message;
	return String(e);
}

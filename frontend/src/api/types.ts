// Mirrors docs/api-contract.md (v1). Keep in sync with the backend.

export type Video = {
	id: number;
	title: string;
	filename: string;
	sha256: string;
	duration_s: number;
	fps: number;
	width: number;
	height: number;
	size_bytes: number;
	has_audio: boolean;
	tags: string[];
	uploaded_at: string;
	thumbnail_url: string;
	file_url: string;
	run_count: number;
};

export type OutputLanguage = "fr" | "en";

export type PromptVersion = {
	id: number;
	prompt_id: number;
	version: number;
	system_text: string;
	user_text: string;
	output_language: OutputLanguage;
	created_at: string;
	run_count: number;
};

export type Prompt = {
	id: number;
	name: string;
	notes: string;
	created_at: string;
	versions: PromptVersion[];
	latest_version_id: number;
};

export type Provider = "gemini" | "ollama" | "openai_compat";
export type InputMode = "native_video" | "frames";

export type Prices = {
	text_in: number;
	image_in: number;
	video_in: number;
	audio_in: number;
	cached_in: number;
	out: number;
	source_url?: string;
	valid_from?: string;
};

export type ModelConfig = {
	id: string;
	display_name: string;
	provider: Provider;
	model_id: string;
	base_url: string | null;
	input_modes: InputMode[];
	params: Record<string, unknown>;
	tokens_per_frame: number;
	max_images: number | null;
	prices: Prices;
	vram_note: string | null;
	licence: string | null;
	notes: string | null;
	enabled: boolean;
	availability: { available: boolean; reason: string | null };
};

export type FramePreset = {
	key: string;
	label: string;
	description: string;
	fps: number;
	long_edge: number;
	max_frames: number;
	jpeg_quality: number;
};

export type Target = { model_config_id: string; input_mode: InputMode };

export type Estimate = {
	model_config_id: string;
	input_mode: string;
	frames: number;
	est_tokens_in: number;
	est_cost_usd: number;
	exact: boolean;
	warnings: string[];
};

export type RunStatus = "queued" | "running" | "done" | "error" | "interrupted" | "cancelled";

export type BatchSummary = {
	id: number;
	name: string;
	created_at: string;
	video_id: number;
	video_title: string;
	prompt_version_id: number;
	prompt_name: string;
	prompt_version: number;
	frame_preset: string;
	repeats: number;
	blind: boolean;
	counts: Record<RunStatus, number>;
	run_count: number;
};

export type Batch = BatchSummary & { runs: Run[] };

export type RunMetrics = {
	upload_ms: number | null;
	extract_ms: number | null;
	model_load_ms: number | null;
	ttft_ms: number | null;
	model_ms: number | null;
	total_ms: number | null;
	cold_start: boolean;
	cache_hit: boolean;
	tokens_in_total: number | null;
	tokens_in_text: number | null;
	tokens_in_image: number | null;
	tokens_in_video: number | null;
	tokens_in_audio: number | null;
	tokens_in_cached: number | null;
	tokens_out: number | null;
	tokens_thinking: number | null;
	truncated_suspected: boolean;
	frames_sent: number | null;
	video_seconds_sent: number | null;
	output_chars: number | null;
	output_words: number | null;
	tokens_out_per_s: number | null;
	cost_api_usd: number | null;
	gpu_seconds: number | null;
	gpu_energy_wh: number | null;
	cost_energy_usd: number | null;
	gpu_peak_vram_delta_mb: number | null;
	model_vram_mb: number | null;
	model_version: string | null;
	sdk_versions: Record<string, string> | null;
};

export type Rating = {
	id: number;
	run_id: number;
	rater: string;
	stars: number;
	notes: string;
	blind: boolean;
	created_at: string;
	updated_at: string;
};

export type Run = {
	id: number;
	batch_id: number;
	repeat_index: number;
	video_id: number;
	prompt_version_id: number;
	model_config_id: string;
	model_label: string;
	provider: string;
	model_snapshot: ModelConfig;
	input_mode: InputMode;
	frame_preset: string;
	frame_plan: FramePreset | null;
	frame_plan_hash: string | null;
	host: string;
	status: RunStatus;
	stage: string | null;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
	output_text: string | null;
	error: string | null;
	retries: number;
	metrics: RunMetrics;
	raw_usage: Record<string, unknown> | null;
	request_summary: Record<string, unknown> | null;
	rating: Rating | null;
	video_title: string;
	prompt_name: string;
	prompt_version: number;
	blind: boolean;
};

export type RunFrames = {
	count: number;
	contact_sheet_url: string | null;
	frames: { index: number; t: number; url: string }[];
};

export type Health = {
	status: "ok";
	host: string;
	gemini_configured: boolean;
	ollama_url: string | null;
	ollama_reachable: boolean;
	gpu: GpuInfo;
};

export type DashboardFilters = {
	prompts: { id: number; name: string }[];
	videos: { id: number; title: string }[];
	hosts: string[];
	presets: string[];
	models: { id: string; display_name: string }[];
};

export type SummaryRow = {
	key: string;
	model_config_id: string;
	display_name: string;
	provider: string;
	input_mode: string;
	frame_preset: string;
	n: number;
	n_rated: number;
	stars_mean: number | null;
	stars_min: number | null;
	stars_max: number | null;
	model_ms_median: number | null;
	model_ms_min: number | null;
	model_ms_max: number | null;
	ttft_ms_median: number | null;
	total_ms_median: number | null;
	tokens_in_mean: number | null;
	tokens_out_mean: number | null;
	tokens_thinking_mean: number | null;
	tokens_out_per_s_mean: number | null;
	cost_api_usd_mean: number | null;
	cost_api_usd_total: number | null;
	cost_energy_usd_mean: number | null;
	gpu_peak_vram_delta_mb_max: number | null;
	model_vram_mb: number | null;
	truncated_count: number;
	error_count: number;
};

export type PointRow = {
	run_id: number;
	batch_id: number;
	model_config_id: string;
	display_name: string;
	provider: string;
	input_mode: string;
	frame_preset: string;
	video_id: number;
	stars: number | null;
	cost_api_usd: number | null;
	model_ms: number | null;
	ttft_ms: number | null;
	tokens_in_total: number | null;
	tokens_out: number | null;
	cold_start: boolean;
};

export type DashboardQuery = {
	prompt_id?: number;
	video_id?: number;
	host?: string;
	frame_preset?: string;
	include_cold?: boolean;
	rater?: string;
};

// Request bodies
export type CreatePromptBody = {
	name: string;
	notes?: string;
	system_text: string;
	user_text: string;
	output_language: OutputLanguage;
};
export type NewPromptVersionBody = {
	system_text: string;
	user_text: string;
	output_language: OutputLanguage;
};
export type EstimateBody = {
	video_id: number;
	prompt_version_id: number;
	targets: Target[];
	frame_preset: string;
};
export type CreateBatchBody = EstimateBody & {
	name?: string;
	repeats?: number;
	blind?: boolean;
};
export type RatingBody = { stars: number; notes?: string; rater?: string };

// SSE payloads
export type RunStatusEvent = {
	status: RunStatus;
	stage: string | null;
	message?: string | null;
};
export type RunDeltaEvent = { text: string };
export type RunDoneEvent = { run: Run };
export type RunErrorEvent = { message: string };
export type GlobalRunEvent = {
	run_id: number;
	batch_id: number;
	status: RunStatus;
	stage: string | null;
};

// Settings and setup (see "Settings and setup" in docs/api-contract.md)
export type Settings = {
	gemini_key_set: boolean;
	/** e.g. "…k3Qz"; the key itself is never returned */
	gemini_key_hint: string | null;
	ollama_url: string;
	host_name: string;
	energy_price_per_kwh: number;
	data_dir: string;
	env_file: string;
	packaged: boolean;
	version: string;
};

/** Pass an empty string to clear a value. */
export type SettingsUpdate = {
	gemini_api_key?: string;
	ollama_url?: string;
	host_name?: string;
	energy_price_per_kwh?: number;
};

export type GeminiTestResult = { ok: boolean; message: string; models: string[] };

export type GpuInfo = {
	available: boolean;
	name: string | null;
	vram_total_mb: number | null;
};

export type SetupStatus = {
	gemini_key_set: boolean;
	gemini_ok: boolean | null;
	ollama_reachable: boolean;
	ollama_version: string | null;
	models_available: number;
	models_total_local: number;
	videos: number;
	gpu: GpuInfo;
	complete: boolean;
};

export type OllamaModel = {
	name: string;
	size_bytes: number;
	modified_at: string;
	model_config_id: string | null;
};

export type OllamaStatus = {
	reachable: boolean;
	version: string | null;
	url: string;
	installed: OllamaModel[];
	disk_free_gb: number | null;
	models_dir: string | null;
};

export type PullStatus = "pulling" | "done" | "error" | "cancelled";

export type PullJob = {
	model_config_id: string;
	tag: string;
	status: PullStatus;
	completed_bytes: number;
	total_bytes: number | null;
	percent: number | null;
	message: string;
	started_at: string;
	finished_at: string | null;
};

export type ApiErrorBody = { detail: string };

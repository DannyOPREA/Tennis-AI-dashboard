import { FilmIcon, PencilIcon, PlayIcon, UploadIcon } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, uploadVideo } from "@/api/client";
import type { Video } from "@/api/types";
import { Tag } from "@/components/common/chips";
import { CardGridSkeleton, EmptyState, ErrorState, PageHeader } from "@/components/common/states";
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
import { Progress } from "@/components/ui/progress";
import { t } from "@/i18n";
import { fmtBytes, fmtClock, fmtDate, fmtDims, fmtPercent } from "@/lib/format";
import { useAsync, useDocumentTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];
const ACCEPT_EXT = /\.(mp4|mov|webm)$/i;

type Upload = {
	id: number;
	name: string;
	progress: number;
	state: "uploading" | "done" | "error";
	message?: string;
};

export function LibraryPage() {
	useDocumentTitle(`${t.library.title} – ${t.app.name}`);
	const videos = useAsync(() => api.videos.list(), []);
	const toast = useToast();
	const [uploads, setUploads] = useState<Upload[]>([]);
	const [dragging, setDragging] = useState(false);
	const [editing, setEditing] = useState<Video | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const seq = useRef(0);
	const { setData: setVideos } = videos;

	const startUpload = useCallback(
		(file: File) => {
			if (!ACCEPT.includes(file.type) && !ACCEPT_EXT.test(file.name)) {
				toast.error(t.library.uploadUnsupported);
				return;
			}
			const id = ++seq.current;
			setUploads((u) => [...u, { id, name: file.name, progress: 0, state: "uploading" }]);
			uploadVideo(file, {
				onProgress: (f) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: f } : x))),
			})
				.then((video) => {
					setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: 1, state: "done" } : x)));
					setVideos((prev) => {
						const list = prev ?? [];
						const exists = list.some((v) => v.id === video.id);
						if (exists) toast.toast(t.library.uploadDuplicate);
						return exists ? list.map((v) => (v.id === video.id ? video : v)) : [video, ...list];
					});
					window.setTimeout(() => setUploads((u) => u.filter((x) => x.id !== id)), 2500);
				})
				.catch((e) => {
					setUploads((u) => u.map((x) => (x.id === id ? { ...x, state: "error", message: errorMessage(e) } : x)));
				});
		},
		[toast, setVideos],
	);

	function onFiles(files: FileList | null) {
		if (!files) return;
		for (const f of Array.from(files)) startUpload(f);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		setDragging(false);
		onFiles(e.dataTransfer.files);
	}

	return (
		<>
			<PageHeader
				title={t.library.title}
				description={t.library.description}
				actions={
					<Button onClick={() => fileInput.current?.click()}>
						<UploadIcon data-icon="inline-start" />
						{t.library.upload}
					</Button>
				}
			/>
			<input
				ref={fileInput}
				type="file"
				accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
				multiple
				className="hidden"
				onChange={(e) => {
					onFiles(e.target.files);
					e.target.value = "";
				}}
			/>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone; the button inside is the keyboard path */}
			<div
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
				className={cn(
					"mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
					dragging ? "border-terre bg-terre-soft" : "bg-card/60",
				)}
			>
				<span className="flex items-center gap-2 text-muted-foreground">
					<UploadIcon aria-hidden className="size-4" />
					{t.library.uploadHint}
				</span>
				<Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
					{t.library.upload}
				</Button>
				{uploads.length > 0 ? (
					<ul className="basis-full space-y-2 pt-1">
						{uploads.map((u) => (
							<li key={u.id} className="flex items-center gap-3 text-xs">
								<span className="w-40 truncate">{u.name}</span>
								{u.state === "error" ? (
									<span role="alert" className="text-destructive">
										{t.library.uploadFailed}: {u.message}
									</span>
								) : (
									<>
										<Progress value={u.progress * 100} className="max-w-64 flex-1" />
										<span className="tabular w-10 text-right text-muted-foreground">
											{u.state === "done" ? t.library.uploadDone : fmtPercent(u.progress)}
										</span>
									</>
								)}
							</li>
						))}
					</ul>
				) : null}
			</div>

			{videos.error && !videos.data ? <ErrorState message={videos.error} onRetry={() => void videos.reload()} /> : null}
			{videos.loading && !videos.data ? <CardGridSkeleton /> : null}
			{videos.data && videos.data.length === 0 ? (
				<EmptyState icon={FilmIcon} title={t.library.empty} hint={t.library.emptyHint} />
			) : null}
			{videos.data && videos.data.length > 0 ? (
				<ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
					{videos.data.map((v) => (
						<VideoCard key={v.id} video={v} onEdit={() => setEditing(v)} />
					))}
				</ul>
			) : null}

			<EditVideoDialog
				video={editing}
				onClose={() => setEditing(null)}
				onSaved={(v) => {
					videos.setData((prev) => (prev ?? []).map((x) => (x.id === v.id ? v : x)));
					setEditing(null);
					toast.success(t.toast.videoUpdated);
				}}
			/>
		</>
	);
}

function VideoCard({ video, onEdit }: { video: Video; onEdit: () => void }) {
	return (
		<li className="group flex flex-col overflow-hidden rounded-xl border bg-card">
			<div className="relative aspect-video bg-muted">
				<img src={api.videos.thumbnailUrl(video.id)} alt="" loading="lazy" className="size-full object-cover" />
				<span className="tabular absolute right-2 bottom-2 rounded bg-baseline/80 px-1.5 py-0.5 text-[11px] text-white">
					{fmtClock(video.duration_s)}
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-2 p-3">
				<div className="flex items-start justify-between gap-2">
					<h3 className="min-w-0 truncate text-sm font-medium" title={video.title}>
						{video.title}
					</h3>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={t.library.editDetails}
						onClick={onEdit}
						className="-mt-0.5 -mr-1 shrink-0"
					>
						<PencilIcon />
					</Button>
				</div>
				<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
					<span>{fmtDims(video.width, video.height)}</span>
					<span>{fmtBytes(video.size_bytes)}</span>
					<span>{fmtDate(video.uploaded_at)}</span>
				</div>
				{video.tags.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						{video.tags.map((tag) => (
							<Tag key={tag}>{tag}</Tag>
						))}
					</div>
				) : null}
				<div className="mt-auto flex items-center justify-between pt-1">
					<span className="text-xs text-muted-foreground">{t.library.runCount(video.run_count)}</span>
					<Button size="sm" variant="outline" render={<Link to={`/runs/new?video=${video.id}`} />}>
						<PlayIcon data-icon="inline-start" />
						{t.library.newRun}
					</Button>
				</div>
			</div>
		</li>
	);
}

function EditVideoDialog({
	video,
	onClose,
	onSaved,
}: {
	video: Video | null;
	onClose: () => void;
	onSaved: (v: Video) => void;
}) {
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [forId, setForId] = useState<number | null>(null);

	// Reset local form state when a different video is opened.
	if (video && video.id !== forId) {
		setForId(video.id);
		setTitle(video.title);
		setTags(video.tags.join(", "));
		setErr(null);
	}

	async function save() {
		if (!video) return;
		setBusy(true);
		setErr(null);
		try {
			const saved = await api.videos.patch(video.id, {
				title: title.trim() || video.title,
				tags: tags
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			onSaved(saved);
		} catch (e) {
			setErr(errorMessage(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={video !== null} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t.library.videoDetails}</DialogTitle>
					<DialogDescription>
						{video
							? `${video.filename}, ${fmtClock(video.duration_s)}, ${fmtDims(video.width, video.height)}, ${video.fps} fps`
							: null}
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						void save();
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="video-title">{t.prompts.name}</Label>
						<Input id="video-title" value={title} onChange={(e) => setTitle(e.target.value)} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="video-tags">{t.library.tags}</Label>
						<Input
							id="video-tags"
							value={tags}
							onChange={(e) => setTags(e.target.value)}
							placeholder={t.library.tagsPlaceholder}
						/>
					</div>
					{err ? (
						<p role="alert" className="text-sm text-destructive">
							{err}
						</p>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							{t.common.cancel}
						</Button>
						<Button type="submit" disabled={busy}>
							{busy ? t.common.saving : t.common.save}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

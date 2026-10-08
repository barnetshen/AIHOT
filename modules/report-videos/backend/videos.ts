// The videos of the newest dailies and weeklies and of the newest selected items, kept in step with them
// as the public read layer shows them now. Each run reads every kept issue and item and renders the ones
// whose scenes changed: a new one, a correction, a withdrawn citation, a video found for its news. A file
// is named by its kind, key and the fingerprint of its scenes, so a changed one gets a new address and the
// old file is removed once the new one is listed. A changed one this run cannot render in time loses its
// old video rather than keep showing what was withdrawn, and so does one whose render failed; videos of
// what is no longer among the kept ones are removed.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import type { Finding } from "@aihot/backend/notify/feishu";
import { listReports, loadReport } from "@aihot/backend/publication/reports";
import { loadTimeline } from "@aihot/backend/publication/timeline";
import type { VideoEntry, VideoKind, VideosResponse } from "../types.ts";
import { fetchClip, findClips } from "./clips.ts";
import { encode, totalSeconds, type Shot } from "./encode.ts";
import { renderFrame } from "./frames.ts";
import { fingerprintOf, itemScenes, momentLabel, periodLabel, scenesOf, secondsOf, toldItems, type Scene } from "./scenes.ts";

const run = promisify(execFile);

export const VIDEO_DIR = path.join(config.dataDir, "videos");
/** What has a video, newest first: the issues of each kind, the selected items as the 精选 list shows them. */
export const KEEP: Record<VideoKind, number> = { daily: 14, weekly: 8, item: 60 };
/** Renders in one run at most, newest first, so catching up after a pause spreads over runs. */
const PER_RUN = { issues: 3, items: 12 };
/** A file of ours: the kind, the key, the fingerprint and the extension. */
export const FILE_NAME = /^(daily|weekly|item)-([0-9A-Za-z-]+)-([0-9a-f]{16})\.(mp4|jpg)$/;

const fileOf = (kind: VideoKind, key: string, fingerprint: string, ext: "mp4" | "jpg") => `${kind}-${key}-${fingerprint}.${ext}`;

interface Row {
  kind: VideoKind;
  key: string;
  title: string;
  headline: string | null;
  issue_number: number | null;
  at: Date;
  fingerprint: string;
  duration_ms: number;
  bytes: number;
  clips: number;
  rendered_at: Date;
}

/** An issue or an item as it should be shown now. */
interface Unit {
  kind: VideoKind;
  key: string;
  title: string;
  headline: string | null;
  issueNumber: number | null;
  at: Date;
  scenes: Scene[];
}

/** The kept issues and items as they are now, newest first by kind; the issues come first. */
async function currentUnits(): Promise<Unit[]> {
  const units: Unit[] = [];
  for (const kind of ["daily", "weekly"] as const) {
    for (const { key } of await listReports(kind, KEEP[kind])) {
      const report = await loadReport(kind, key);
      if (!report) continue;
      const scenes = scenesOf(report, await findClips(toldItems(report)));
      const cover = scenes[0]?.type === "cover" ? scenes[0] : null;
      if (scenes.length) units.push({ kind, key, title: report.title, headline: cover?.headline ?? null, issueNumber: report.issueNumber, at: new Date(report.generatedAt), scenes });
    }
  }
  const { cards } = await loadTimeline({ channel: "all", category: null, tag: null, limit: KEEP.item });
  const clips = await findClips(cards.map((c) => c.item.id));
  for (const card of cards) {
    units.push({ kind: "item", key: card.item.id, title: card.item.title, headline: null, issueNumber: null, at: new Date(card.item.timelineAt), scenes: itemScenes(card, clips) });
  }
  return units;
}

/**
 * Renders a video and its poster under their final names. A screen whose news has a video plays it when
 * the file can be fetched and read; otherwise the screen is drawn without it.
 */
async function render(unit: Unit, fingerprint: string): Promise<{ durationMs: number; bytes: number; clips: number }> {
  const work = path.join(VIDEO_DIR, `.work-${randomUUID()}`);
  await mkdir(work, { recursive: true });
  try {
    const shots: Shot[] = [];
    for (const [i, scene] of unit.scenes.entries()) {
      let clip: string | null = null;
      let clipSeconds: number | null = null;
      let drawn = scene;
      if ((scene.type === "entry" || scene.type === "item") && scene.entry.clip) {
        clipSeconds = await fetchClip(scene.entry.clip, path.join(work, `clip-${i}`));
        if (clipSeconds !== null) clip = path.join(work, `clip-${i}`);
        else drawn = { ...scene, entry: { ...scene.entry, clip: null } };
      }
      const file = path.join(work, `${i}.png`);
      await writeFile(file, await renderFrame(drawn));
      shots.push({ file, seconds: secondsOf(scene, clipSeconds), clip });
    }
    const video = path.join(work, "video.mp4");
    await encode(shots, video);
    // The poster is the video's own first moment: the cover, or the item's screen with its video playing.
    await run("ffmpeg", ["-y", "-nostdin", "-loglevel", "error", "-ss", "0.5", "-i", video, "-frames:v", "1", "-q:v", "4", path.join(work, "poster.jpg")]);
    const mp4 = path.join(VIDEO_DIR, fileOf(unit.kind, unit.key, fingerprint, "mp4"));
    await rename(path.join(work, "poster.jpg"), path.join(VIDEO_DIR, fileOf(unit.kind, unit.key, fingerprint, "jpg")));
    await rename(video, mp4);
    return { durationMs: Math.round(totalSeconds(shots.map((s) => s.seconds)) * 1000), bytes: (await stat(mp4)).size, clips: shots.filter((s) => s.clip).length };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function removeFiles(row: Pick<Row, "kind" | "key" | "fingerprint">) {
  for (const ext of ["mp4", "jpg"] as const) await rm(path.join(VIDEO_DIR, fileOf(row.kind, row.key, row.fingerprint, ext)), { force: true });
}

async function drop(row: Row) {
  await sql`DELETE FROM report_videos WHERE kind = ${row.kind} AND key = ${row.key} AND fingerprint = ${row.fingerprint}`;
  await removeFiles(row);
}

/** One run of the schedule: renders what changed, removes what is gone; returns what it did, or fails once it is done when a render failed. */
export async function refreshVideos(): Promise<{ rendered: string[]; removed: string[]; waiting: string[] }> {
  await mkdir(VIDEO_DIR, { recursive: true });
  const rows = await sql<Row[]>`SELECT * FROM report_videos`;
  const have = new Map(rows.map((r) => [`${r.kind}/${r.key}`, r]));
  const kept = new Set<string>();
  const rendered: string[] = [];
  const waiting: string[] = [];
  const failed: string[] = [];
  const attempts = { issues: 0, items: 0 };
  for (const unit of await currentUnits()) {
    const id = `${unit.kind}/${unit.key}`;
    const fingerprint = fingerprintOf(unit.scenes);
    const row = have.get(id);
    if (row?.fingerprint === fingerprint) {
      kept.add(id);
      continue;
    }
    const budget = unit.kind === "item" ? "items" : "issues";
    if (attempts[budget]++ >= PER_RUN[budget]) {
      waiting.push(id);
      continue;
    }
    try {
      await upsert(unit, fingerprint, await render(unit, fingerprint));
    } catch (error) {
      failed.push(`${id}: ${String(error).slice(0, 500)}`);
      continue;
    }
    if (row) await removeFiles(row);
    kept.add(id);
    rendered.push(id);
  }
  const removed: string[] = [];
  for (const row of rows) {
    const id = `${row.kind}/${row.key}`;
    if (kept.has(id)) continue;
    await drop(row);
    removed.push(id);
  }
  await removeStrays();
  if (failed.length) throw new Error(`video render failed (rendered ${rendered.length}, removed ${removed.length}): ${failed.join("; ")}`);
  return { rendered, removed, waiting };
}

async function upsert(unit: Unit, fingerprint: string, made: { durationMs: number; bytes: number; clips: number }) {
  await sql`
    INSERT INTO report_videos (kind, key, title, headline, issue_number, at, fingerprint, duration_ms, bytes, clips, rendered_at)
    VALUES (${unit.kind}, ${unit.key}, ${unit.title}, ${unit.headline}, ${unit.issueNumber}, ${unit.at}, ${fingerprint}, ${made.durationMs}, ${made.bytes}, ${made.clips}, now())
    ON CONFLICT (kind, key) DO UPDATE SET title = EXCLUDED.title, headline = EXCLUDED.headline, issue_number = EXCLUDED.issue_number, at = EXCLUDED.at,
      fingerprint = EXCLUDED.fingerprint, duration_ms = EXCLUDED.duration_ms, bytes = EXCLUDED.bytes, clips = EXCLUDED.clips, rendered_at = EXCLUDED.rendered_at`;
}

/** Files no row names (a run stopped half way): a work folder or a video whose row was never written. */
async function removeStrays() {
  const named = new Set((await sql<Row[]>`SELECT kind, key, fingerprint FROM report_videos`).flatMap((r) => [fileOf(r.kind, r.key, r.fingerprint, "mp4"), fileOf(r.kind, r.key, r.fingerprint, "jpg")]));
  for (const name of await readdir(VIDEO_DIR)) if (!named.has(name)) await rm(path.join(VIDEO_DIR, name), { recursive: true, force: true });
}

/** The videos there are, newest first by kind. */
export async function listVideos(): Promise<VideosResponse> {
  const rows = await sql<Row[]>`SELECT * FROM report_videos ORDER BY at DESC, key DESC`;
  const entry = (r: Row): VideoEntry => ({
    kind: r.kind, key: r.key, issueNumber: r.issue_number, title: r.title, headline: r.headline,
    period: r.kind === "item" ? momentLabel(r.at) : periodLabel(r.kind, r.key),
    durationSeconds: Math.round(r.duration_ms / 1000), bytes: Number(r.bytes), clips: r.clips,
    video: `/api/videos/files/${fileOf(r.kind, r.key, r.fingerprint, "mp4")}`,
    poster: `/api/videos/files/${fileOf(r.kind, r.key, r.fingerprint, "jpg")}`,
    page: r.kind === "item" ? `/items/${r.key}` : `/${r.kind}/${r.key}`, renderedAt: r.rendered_at.toISOString(),
  });
  const of = (kind: VideoKind) => rows.filter((r) => r.kind === kind).map(entry);
  return { daily: of("daily"), weekly: of("weekly"), items: of("item") };
}

/** Runs of the schedule that failed one after another before the owner hears of it: half an hour of them. */
const FAILED_RUNS = 3;

/** The renders have been failing (ffmpeg missing, the disk full): new issues and items get no video. */
export async function videoFindings(): Promise<Finding[]> {
  const runs = await sql<{ status: string; error: string | null; started_at: Date }[]>`
    SELECT status, error, started_at FROM job_runs WHERE job = 'videos.render' AND status IN ('ok', 'failed') ORDER BY id DESC LIMIT ${FAILED_RUNS}`;
  if (runs.length < FAILED_RUNS || runs.some((r) => r.status !== "failed")) return [];
  return [{
    key: "videos.failed",
    level: "today",
    title: "视频生成连续失败",
    impact: "新出的日报、周报和精选没有视频，有更正或撤回的视频已下架",
    heals: "不会",
    action: "转给 AI 处理；多半是 worker 所在机器没装 ffmpeg 或磁盘满了",
    detail: `最近一次：${runs[0]!.error ?? ""}；看 videos.render 的运行记录`,
    since: runs.at(-1)!.started_at,
  }];
}

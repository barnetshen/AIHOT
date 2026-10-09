// The broadcasts of the newest dailies and weeklies, kept in step with the issues as the public read
// layer shows them now. Each run reads every kept issue and renders the ones whose scenes changed: a new
// issue, a correction, a withdrawn citation, a video or picture found for its news. A file is named by
// its issue and the fingerprint of its scenes, so a changed issue gets a new address and the old file is
// removed once the new one is listed. A changed issue this run cannot render in time loses its old video
// rather than keep showing what was withdrawn, and so does one whose render failed; videos of issues
// older than the kept ones are removed.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ReportDetail } from "@aihot/contracts/site";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import type { Finding } from "@aihot/backend/notify/feishu";
import { listReports, loadReport } from "@aihot/backend/publication/reports";
import type { Chapter, VideoEntry, VideoKind, VideosResponse } from "../types.ts";
import { encode, FADE, totalSeconds, type Shot } from "./encode.ts";
import { CLIP_BOX, renderScreen, renderStill } from "./frames.ts";
import { fetchClip, fetchPicture, findMedia } from "./media.ts";
import { fingerprintOf, narration, periodLabel, scenesOf, toldItems, type Scene } from "./scenes.ts";
import { voice } from "./voice.ts";

export const VIDEO_DIR = path.join(config.dataDir, "videos");
/** The issues of each kind that have a video, newest first. */
export const KEEP: Record<VideoKind, number> = { daily: 14, weekly: 8 };
/** Videos rendered in one run at most, newest first, so catching up after a pause spreads over runs. */
const PER_RUN = 3;
/** A file of ours: the issue, the fingerprint and the extension. */
export const FILE_NAME = /^(daily|weekly)-([0-9W-]+)-([0-9a-f]{16})\.(mp4|jpg)$/;
/** The pause after a screen's narration before the next screen fades in. */
const PAUSE = 0.6;

const fileOf = (kind: VideoKind, key: string, fingerprint: string, ext: "mp4" | "jpg") => `${kind}-${key}-${fingerprint}.${ext}`;

interface Row {
  kind: VideoKind;
  key: string;
  title: string;
  headline: string | null;
  issue_number: number;
  fingerprint: string;
  duration_ms: number;
  bytes: number;
  clips: number;
  pictures: number;
  chapters: Chapter[] | null;
  rendered_at: Date;
}

interface Made {
  durationMs: number;
  bytes: number;
  clips: number;
  pictures: number;
  chapters: Chapter[];
}

/** A picture a little larger than the box, so it can drift across it. */
const DRIFT = { width: Math.round(CLIP_BOX.width * 1.15), height: Math.round(CLIP_BOX.height * 1.15) };

/**
 * Renders an issue's broadcast and its poster under their final names. Every screen is held while its
 * narration is read; a screen about a report shows the report's video when it can be fetched and read,
 * else its picture, else only its text. The chapters are where each entry's screen (and the headlines')
 * begins.
 */
async function render(kind: VideoKind, key: string, scenes: Scene[], fingerprint: string): Promise<Made> {
  const work = path.join(VIDEO_DIR, `.work-${randomUUID()}`);
  await mkdir(work, { recursive: true });
  try {
    const lines = scenes.map((scene, i) => ({ text: narration(scene), file: path.join(work, `speech-${i}.wav`) }));
    const spoken = await voice.speak(lines);
    const shots: Shot[] = [];
    const chapters: Chapter[] = [];
    let pictures = 0;
    let start = 0;
    for (const [i, scene] of scenes.entries()) {
      let clip: string | null = null;
      let picture: Shot["picture"] = null;
      let drawn = scene;
      if (scene.type === "entry" && (scene.entry.video || scene.entry.image)) {
        if (scene.entry.video && (await fetchClip(scene.entry.video, path.join(work, `clip-${i}`))) !== null) clip = path.join(work, `clip-${i}`);
        else if (scene.entry.image) {
          const png = await fetchPicture(scene.entry.image, DRIFT);
          if (png) {
            await writeFile(path.join(work, `picture-${i}.png`), png);
            // Alternate screens drift opposite ways.
            picture = { file: path.join(work, `picture-${i}.png`), reverse: pictures++ % 2 === 1 };
          }
        }
        if (!clip && !picture) drawn = { ...scene, entry: { ...scene.entry, video: null, image: null } };
      }
      const screen = await renderScreen(drawn);
      const base = path.join(work, `${i}.png`);
      await writeFile(base, screen.base);
      const layers = [];
      for (const [k, layer] of screen.layers.entries()) {
        const file = path.join(work, `${i}-${k}.png`);
        await writeFile(file, layer.png);
        layers.push({ file, x: layer.x, y: layer.y });
      }
      // The first screen's parts come in a moment after the video starts, the others' once it has faded in;
      // then its narration is read and a short pause follows.
      const enter = i ? FADE : 0.3;
      const seconds = enter + spoken[i]! + PAUSE + FADE;
      shots.push({ base, layers, seconds, enter, clip, picture, story: screen.story, speech: lines[i]!.file });
      if (scene.type === "entry") chapters.push({ at: Math.round(start * 10) / 10, rank: scene.rank, title: scene.entry.title });
      if (scene.type === "headlines") chapters.push({ at: Math.round(start * 10) / 10, rank: null, title: "更多快讯" });
      start += seconds - FADE;
    }
    const video = path.join(work, "video.mp4");
    await encode(shots, video);
    // The poster is the cover as it looks once everything has come in.
    await sharp(await renderStill(scenes[0]!)).jpeg({ quality: 82 }).toFile(path.join(work, "poster.jpg"));
    const mp4 = path.join(VIDEO_DIR, fileOf(kind, key, fingerprint, "mp4"));
    await rename(path.join(work, "poster.jpg"), path.join(VIDEO_DIR, fileOf(kind, key, fingerprint, "jpg")));
    await rename(video, mp4);
    return {
      durationMs: Math.round(totalSeconds(shots.map((s) => s.seconds)) * 1000), bytes: (await stat(mp4)).size,
      clips: shots.filter((s) => s.clip).length, pictures, chapters,
    };
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
  let attempts = 0;
  for (const kind of ["daily", "weekly"] as const) {
    for (const { key } of await listReports(kind, KEEP[kind])) {
      const id = `${kind}/${key}`;
      const report = await loadReport(kind, key);
      const scenes = report ? scenesOf(report, await findMedia(toldItems(report))) : [];
      if (!report || !scenes.length) continue;
      const fingerprint = fingerprintOf(scenes);
      const row = have.get(id);
      if (row?.fingerprint === fingerprint) {
        kept.add(id);
        continue;
      }
      if (attempts++ >= PER_RUN) {
        waiting.push(id);
        continue;
      }
      try {
        await upsert(report, scenes, fingerprint, await render(kind, key, scenes, fingerprint));
      } catch (error) {
        failed.push(`${id}: ${String(error).slice(0, 500)}`);
        continue;
      }
      if (row) await removeFiles(row);
      kept.add(id);
      rendered.push(id);
    }
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

async function upsert(report: ReportDetail, scenes: Scene[], fingerprint: string, made: Made) {
  const cover = scenes[0]!.type === "cover" ? scenes[0] : null;
  await sql`
    INSERT INTO report_videos (kind, key, title, headline, issue_number, fingerprint, duration_ms, bytes, clips, pictures, chapters, rendered_at)
    VALUES (${report.kind}, ${report.key}, ${report.title}, ${cover?.headline ?? null}, ${report.issueNumber}, ${fingerprint},
      ${made.durationMs}, ${made.bytes}, ${made.clips}, ${made.pictures}, ${sql.json(made.chapters as never)}, now())
    ON CONFLICT (kind, key) DO UPDATE SET title = EXCLUDED.title, headline = EXCLUDED.headline, issue_number = EXCLUDED.issue_number,
      fingerprint = EXCLUDED.fingerprint, duration_ms = EXCLUDED.duration_ms, bytes = EXCLUDED.bytes, clips = EXCLUDED.clips,
      pictures = EXCLUDED.pictures, chapters = EXCLUDED.chapters, rendered_at = EXCLUDED.rendered_at`;
}

/** Files no row names (a run stopped half way): a work folder or a video whose row was never written. */
async function removeStrays() {
  const named = new Set((await sql<Row[]>`SELECT kind, key, fingerprint FROM report_videos`).flatMap((r) => [fileOf(r.kind, r.key, r.fingerprint, "mp4"), fileOf(r.kind, r.key, r.fingerprint, "jpg")]));
  for (const name of await readdir(VIDEO_DIR)) if (!named.has(name)) await rm(path.join(VIDEO_DIR, name), { recursive: true, force: true });
}

/** The videos there are, newest first by kind. */
export async function listVideos(): Promise<VideosResponse> {
  const rows = await sql<Row[]>`SELECT * FROM report_videos ORDER BY key DESC`;
  const entry = (r: Row): VideoEntry => ({
    kind: r.kind, key: r.key, issueNumber: r.issue_number, title: r.title, headline: r.headline, period: periodLabel(r.kind, r.key),
    durationSeconds: Math.round(r.duration_ms / 1000), bytes: Number(r.bytes), clips: r.clips, pictures: r.pictures, chapters: r.chapters ?? [],
    video: `/api/videos/files/${fileOf(r.kind, r.key, r.fingerprint, "mp4")}`,
    poster: `/api/videos/files/${fileOf(r.kind, r.key, r.fingerprint, "jpg")}`,
    page: `/${r.kind}/${r.key}`, renderedAt: r.rendered_at.toISOString(),
  });
  return { daily: rows.filter((r) => r.kind === "daily").map(entry), weekly: rows.filter((r) => r.kind === "weekly").map(entry) };
}

/** Runs of the schedule that failed one after another before the owner hears of it: half an hour of them. */
const FAILED_RUNS = 3;

/** The renders have been failing (ffmpeg or the voice model missing, the disk full): new issues get no broadcast. */
export async function videoFindings(): Promise<Finding[]> {
  const runs = await sql<{ status: string; error: string | null; started_at: Date }[]>`
    SELECT status, error, started_at FROM job_runs WHERE job = 'videos.render' AND status IN ('ok', 'failed') ORDER BY id DESC LIMIT ${FAILED_RUNS}`;
  if (runs.length < FAILED_RUNS || runs.some((r) => r.status !== "failed")) return [];
  return [{
    key: "videos.failed",
    level: "today",
    title: "日报周报视频播报生成连续失败",
    impact: "新出的日报周报没有视频播报，有更正或撤回的期数视频已下架",
    heals: "不会",
    action: "转给 AI 处理；多半是 worker 所在机器没装 ffmpeg、没下载语音模型或磁盘满了",
    detail: `最近一次：${runs[0]!.error ?? ""}；看 videos.render 的运行记录`,
    since: runs.at(-1)!.started_at,
  }];
}

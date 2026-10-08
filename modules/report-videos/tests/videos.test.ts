// The videos follow their issues and items. Failure cases: a published daily or a selected item gets no
// video, or one that is not a playable vertical MP4; the news' own video is not played on its screen, or
// is taken from a source that does not allow its full text; an unchanged one is rendered again on every
// run; a withdrawn citation stays in the video, or its old file stays reachable; players cannot seek (no
// byte ranges); a weekly's themes are not told; a file name outside the folder is served; a failed render
// keeps showing a changed issue's old video, or fails without the owner hearing of it.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadReport } from "@aihot/backend/publication/reports";
import { installModules } from "@aihot/backend/modules";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import videos from "../server.ts";
import { listVideos, refreshVideos, VIDEO_DIR, videoFindings } from "../backend/videos.ts";
import { scenesOf } from "../backend/scenes.ts";
import { videoSource } from "../backend/clips.ts";
import { CLIP_BOX } from "../backend/frames.ts";
import type { VideosResponse } from "../types.ts";

const T = tag();
const source = `report-videos-${T}`;
const summaryOnly = `report-videos-summary-${T}`;
const at = new Date("2026-09-30T00:00:00Z");
// Newer than any other issue in the database, so they are among the kept ones.
const DAILY = "2099-03-04";
const WEEKLY = "2099-W09";
let sequence = 0;
installModules([videos]);
const app = await buildApp();
// The news' own video, served from this machine (the guarded fetch refuses private addresses unless told).
config.allowPrivateNetworkFetch = true;
const clipFile = path.join(mkdtempSync(path.join(tmpdir(), "report-videos-")), "clip.mp4");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=3", "-pix_fmt", "yuv420p", clipFile]);
const server = http.createServer((req, res) => {
  if (req.url !== "/clip.mp4") return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": "video/mp4" }).end(readFileSync(clipFile));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const clipUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/clip.mp4`;

before(async () => {
  // The source lets the site show its reports in full, so their videos may be played.
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at, site_fulltext)
    VALUES (${source}, 'Video source', 'rss', 'T1', 'editorial', '2100-01-01', true)`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at, site_fulltext)
    VALUES (${summaryOnly}, 'Summary source', 'rss', 'T1', 'editorial', '2100-01-01', false)`;
});
after(async () => {
  installModules([]);
  server.close();
  await app.close();
  await stopBoss();
  await closeDb();
});

async function citation(title: string, opts: { video?: boolean; from?: string } = {}) {
  const body = `<p>Licensed report fixture</p>${opts.video ? `<video src="${clipUrl}" controls></video>` : ""}`;
  const { articleId } = await upsertMaterial({ sourceId: opts.from ?? source, url: `https://example.com/${T}/${++sequence}`, title,
    bodyText: "Licensed report fixture", bodyHtml: body, bodyStatus: "ok", via: "fetch", publishedAt: at });
  await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${title}, ${`${title} 的摘要`}, 90, true)`;
  await publishArticle(articleId, { releasedAt: at });
  return { itemId: articleId, title, summary: `${title} 的摘要：发生了什么、为什么重要。`, sourceUrl: `https://example.com/${T}/${sequence}`, sourceName: "Video source", sources: 3 };
}

const probe = (file: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_entries", "stream=codec_name,width,height:format=duration", file], { encoding: "utf8" }));
const fileOf = (url: string) => path.join(VIDEO_DIR, url.split("/").at(-1)!);
/** How bright the video box is at a moment: the test pattern is bright, the empty box black. */
async function boxBrightness(file: string, seconds: number) {
  const png = execFileSync("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]);
  // stats() reads the image it was given, not the pipeline's output: crop first.
  const box = await sharp(png).extract({ left: CLIP_BOX.x, top: CLIP_BOX.y, width: CLIP_BOX.width, height: CLIP_BOX.height }).toBuffer();
  const { channels } = await sharp(box).stats();
  return channels.slice(0, 3).reduce((n, c) => n + c.mean, 0) / 3;
}

test("a body's first playable file is the news' video", () => {
  assert.equal(videoSource(`<video src="https://a.example/v.mp4"></video>`), "https://a.example/v.mp4");
  assert.equal(videoSource(`<video><source src="https://a.example/live.m3u8"><source type="video/ogg" src="https://a.example/v.ogv"><source type="video/mp4" src="https://a.example/v.mp4"></video>`), "https://a.example/v.mp4");
  assert.equal(videoSource(`<video src="/relative.mp4"></video><p>no video</p>`), null);
});

test("a daily's video plays the news' own video, is rendered once, follows a withdrawal and can be seeked", async () => {
  const lead = await citation("模型公司发布新一代推理模型", { video: true });
  const other = await citation("开源社区发布评测基准");
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('daily', ${DAILY}, ${at}, ${at}, ${sql.json({ leadItemId: lead.itemId, lead: { title: lead.title, leadParagraph: lead.summary },
      highlights: [other.itemId], sections: [{ label: "模型", items: [lead] }, { label: "研究", items: [other] }] } as never)}, ${at}, 'manual')`;

  const first = await refreshVideos();
  assert.ok(first.rendered.includes(`daily/${DAILY}`), "a published daily gets its video");
  const [video] = (await listVideos()).daily.filter((v) => v.key === DAILY);
  assert.ok(video, "the video is listed");
  assert.equal(video.headline, lead.title);
  assert.equal(video.clips, 1, "the lead's screen plays its video");
  const info = probe(fileOf(video.video));
  assert.deepEqual(info.streams, [{ codec_name: "h264", width: 1080, height: 1920 }], "one vertical H.264 picture, no sound");
  assert.ok(Math.abs(Number(info.format.duration) - video.durationSeconds) <= 1, "the listed length is the file's");
  assert.ok(video.durationSeconds >= 15, "every screen is held long enough to read");
  assert.ok(existsSync(fileOf(video.poster)), "the poster is written with it");
  // The cover lasts 4 s and fades into the lead's screen, then the other one's (5 s or more each).
  assert.ok(await boxBrightness(fileOf(video.video), 5.5) > 60, "the lead's video plays in its box");
  assert.ok(await boxBrightness(fileOf(video.video), 2) < 60, "the cover has no video");

  // Each selected item has a video of its own; the one with a video plays it.
  const items = (await listVideos()).items;
  assert.equal(items.find((v) => v.key === lead.itemId)?.clips, 1);
  assert.equal(items.find((v) => v.key === other.itemId)?.clips, 0, "an item without a video is told in text");
  assert.equal(items.find((v) => v.key === lead.itemId)?.page, `/items/${lead.itemId}`);

  assert.ok(!(await refreshVideos()).rendered.includes(`daily/${DAILY}`), "an unchanged issue keeps its video");

  // Seeking: one byte range, a range from the end, a range past it, the whole file, and HEAD.
  const size = video.bytes;
  const part = await app.inject({ method: "GET", url: video.video, headers: { range: "bytes=0-99" } });
  assert.equal(part.statusCode, 206);
  assert.equal(part.rawPayload.length, 100);
  assert.equal(part.headers["content-range"], `bytes 0-99/${size}`);
  assert.equal(part.headers["content-type"], "video/mp4");
  const tail = await app.inject({ method: "GET", url: video.video, headers: { range: "bytes=-10" } });
  assert.equal(tail.statusCode, 206);
  assert.equal(tail.headers["content-range"], `bytes ${size - 10}-${size - 1}/${size}`);
  assert.equal((await app.inject({ method: "GET", url: video.video, headers: { range: `bytes=${size}-` } })).statusCode, 416);
  const whole = await app.inject({ method: "GET", url: video.video });
  assert.equal(whole.statusCode, 200);
  assert.equal(whole.rawPayload.length, size);
  assert.equal((await app.inject({ method: "HEAD", url: video.video })).headers["content-length"], String(size));
  const listed = (await app.inject({ method: "GET", url: "/api/videos" })).json() as VideosResponse;
  assert.ok(listed.daily.some((v) => v.video === video.video));
  assert.ok(listed.items.some((v) => v.key === lead.itemId));

  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${other.itemId}`;
  assert.ok(!scenesOf((await loadReport("daily", DAILY))!).some((s) => s.type === "entry" && s.entry.title === other.title), "the withdrawn report leaves the scenes");
  const again = await refreshVideos();
  assert.ok(again.rendered.includes(`daily/${DAILY}`), "the changed issue is rendered again");
  assert.ok(again.removed.includes(`item/${other.itemId}`), "the withdrawn item loses its video");
  const [after] = (await listVideos()).daily.filter((v) => v.key === DAILY);
  assert.notEqual(after!.video, video.video, "the new video has a new address");
  assert.ok(!existsSync(fileOf(video.video)) && !existsSync(fileOf(video.poster)), "the old files are removed");
  assert.equal((await app.inject({ method: "GET", url: video.video })).statusCode, 404);

  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${lead.itemId}`;
  assert.ok((await refreshVideos()).removed.includes(`daily/${DAILY}`), "an issue with nothing left to show loses its video");
  assert.ok(!existsSync(fileOf(after!.video)));
});

test("a weekly goes theme by theme and links its issue; a source without full text lends no video", async (t) => {
  // The report index is kept for a minute; this run reads one made after the issue.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 600_001 });
  const a = await citation("芯片出口规则调整");
  const b = await citation("两家公司宣布合并", { video: true, from: summaryOnly });
  const c = await citation("新模型登顶评测榜");
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('weekly', ${WEEKLY}, ${at}, ${at}, ${sql.json({ overview: "本周的两条主线。", themes: [
      { heading: "政策", summary: "监管的变化。", storyRefs: [a, b] }, { heading: "模型", summary: null, storyRefs: [c] }] } as never)}, ${at}, 'manual')`;
  const scenes = scenesOf((await loadReport("weekly", WEEKLY))!);
  assert.deepEqual(scenes.map((s) => s.type), ["cover", "theme", "entry", "entry", "theme", "entry", "outro"]);
  const outro = scenes.at(-1)!;
  assert.equal(outro.type === "outro" && new URL(outro.url).pathname, `/weekly/${WEEKLY}`);
  assert.ok((await refreshVideos()).rendered.includes(`weekly/${WEEKLY}`));
  const [video] = (await listVideos()).weekly.filter((v) => v.key === WEEKLY);
  assert.equal(video!.period, "2月23日—3月1日");
  assert.equal(video!.headline, null, "a weekly without a headline of its own leads with none");
  assert.equal(video!.clips, 0, "the summary-only source's video is not used");
});

test("only the videos' own files are served", async () => {
  for (const name of ["..%2F..%2Fpackage.json", "daily-2099-03-04-0123456789abcdef.mp4", "notes.txt"]) {
    assert.equal((await app.inject({ method: "GET", url: `/api/videos/files/${name}` })).statusCode, 404, name);
  }
});

test("a changed issue whose render fails loses its old video, and repeated failures are reported", async (t) => {
  // Later than the clock of the weekly's test, whose report index would still be fresh.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 3_600_000 });
  const key = "2099-03-05";
  const item = await citation("云厂商下调推理价格");
  const content = (summary: string) => sql.json({ leadItemId: item.itemId, lead: { title: item.title, leadParagraph: summary },
    sections: [{ label: "产品", items: [{ ...item, summary }] }] } as never);
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('daily', ${key}, ${at}, ${at}, ${content(item.summary)}, ${at}, 'manual')`;
  await refreshVideos();
  const [before] = (await listVideos()).daily.filter((v) => v.key === key);
  assert.ok(before);

  await sql`UPDATE reports SET content = ${content("更正后的摘要。")} WHERE kind = 'daily' AND key = ${key}`;
  const path = process.env.PATH;
  process.env.PATH = "/nonexistent";
  try {
    await assert.rejects(refreshVideos(), /video render failed/, "the run fails, so its record says so");
  } finally {
    process.env.PATH = path;
  }
  assert.ok(!(await listVideos()).daily.some((v) => v.key === key), "the old video is not shown in place of the corrected issue");
  assert.ok(!existsSync(fileOf(before.video)));

  assert.deepEqual(await videoFindings(), [], "no runs failed yet");
  await sql`INSERT INTO job_runs (job, status, finished_at, error) SELECT 'videos.render', 'failed', now(), 'spawn ffmpeg ENOENT' FROM generate_series(1, 3)`;
  assert.equal((await videoFindings())[0]?.key, "videos.failed");
  await sql`INSERT INTO job_runs (job, status, finished_at) VALUES ('videos.render', 'ok', now())`;
  assert.deepEqual(await videoFindings(), [], "a run that succeeds ends it");
});

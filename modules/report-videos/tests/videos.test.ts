// The broadcasts follow their issues. Failure cases: a published daily gets no broadcast, or one that is
// not a playable vertical MP4 with its narration; a screen is not held while its narration is read; the
// news' own video or picture is not shown on its screen, or is taken from a source that does not allow
// its full text; an unchanged issue is rendered again on every run; a withdrawn citation stays in the
// video or the narration, or its old file stays reachable; players cannot seek (no byte ranges); a
// weekly's themes are not told; a file name outside the folder is served; a failed render keeps showing
// a changed issue's old video, or fails without the owner hearing of it.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { narration, scenesOf, spoken } from "../backend/scenes.ts";
import { videoSource } from "../backend/media.ts";
import { CLIP_BOX } from "../backend/frames.ts";
import { voice, VOICE_DIR, type Line } from "../backend/voice.ts";
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

// The news' own video and picture, served from this machine (the guarded fetch refuses private addresses unless told).
config.allowPrivateNetworkFetch = true;
const fixtures = mkdtempSync(path.join(tmpdir(), "report-videos-"));
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=3", "-pix_fmt", "yuv420p", path.join(fixtures, "clip.mp4")]);
await sharp({ create: { width: 1200, height: 675, channels: 3, background: "#f0e070" } }).png().toFile(path.join(fixtures, "picture.png"));
const server = http.createServer((req, res) => {
  const name = req.url?.slice(1) ?? "";
  if (!["clip.mp4", "picture.png"].includes(name)) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": name.endsWith(".mp4") ? "video/mp4" : "image/png" }).end(readFileSync(path.join(fixtures, name)));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// The voice model is fetched when the image is built; here a tone stands in for it, a second per twenty
// characters, and what was read is kept.
const read: string[] = [];
const realSpeak = voice.speak;
voice.speak = async (lines: Line[]) => lines.map(({ text, file }) => {
  read.push(text);
  const seconds = Math.max(1, [...text].length / 20);
  const rate = 16000;
  const samples = Buffer.alloc(Math.round(seconds * rate) * 2);
  for (let i = 0; i < samples.length / 2; i++) samples.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + samples.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(samples.length, 40);
  writeFileSync(file, Buffer.concat([header, samples]));
  return samples.length / 2 / rate;
});

before(async () => {
  // The source lets the site show its reports in full, so their videos and pictures may be shown.
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

async function citation(title: string, opts: { video?: boolean; picture?: boolean; from?: string } = {}) {
  const body = `<p>Licensed report fixture</p>${opts.video ? `<video src="${base}/clip.mp4" controls></video>` : ""}`;
  const { articleId } = await upsertMaterial({ sourceId: opts.from ?? source, url: `https://example.com/${T}/${++sequence}`, title,
    bodyText: "Licensed report fixture", bodyHtml: body, bodyStatus: "ok", via: "fetch", publishedAt: at,
    media: opts.picture ? [{ kind: "image", url: `${base}/picture.png`, width: 1200, height: 675 }] : [] });
  await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${title}, ${`${title} 的摘要`}, 90, true)`;
  await publishArticle(articleId, { releasedAt: at });
  return { itemId: articleId, title, summary: `${title} 的摘要：发生了什么、为什么重要。`, sourceUrl: `https://example.com/${T}/${sequence}`, sourceName: "Video source", sources: 3 };
}

const probe = (file: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", file], { encoding: "utf8" }));
const fileOf = (url: string) => path.join(VIDEO_DIR, url.split("/").at(-1)!);
/** How bright the box is at a moment: the test pattern and the picture are bright, the cover's background dark. */
async function boxBrightness(file: string, seconds: number) {
  const png = execFileSync("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]);
  // stats() reads the image it was given, not the pipeline's output: crop first.
  const box = await sharp(png).extract({ left: CLIP_BOX.x, top: CLIP_BOX.y, width: CLIP_BOX.width, height: CLIP_BOX.height }).toBuffer();
  const { channels } = await sharp(box).stats();
  return channels.slice(0, 3).reduce((n, c) => n + c.mean, 0) / 3;
}

test("a body's first playable file is the news' video, and text is read as it is meant", () => {
  assert.equal(videoSource(`<video src="https://a.example/v.mp4"></video>`), "https://a.example/v.mp4");
  assert.equal(videoSource(`<video><source src="https://a.example/live.m3u8"><source type="video/ogg" src="https://a.example/v.ogv"><source type="video/mp4" src="https://a.example/v.mp4"></video>`), "https://a.example/v.mp4");
  assert.equal(videoSource(`<video src="/relative.mp4"></video><p>no video</p>`), null);
  assert.equal(spoken("《报告》称：详见 https://a.example/x …"), "报告称，详见");
});

test("a daily's broadcast reads every screen, shows the news' video and picture, follows a withdrawal and can be seeked", async () => {
  const lead = await citation("模型公司发布新一代推理模型", { video: true });
  const second = await citation("开源社区发布评测基准", { picture: true });
  const third = await citation("芯片厂商公布新一季财报");
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('daily', ${DAILY}, ${at}, ${at}, ${sql.json({ leadItemId: lead.itemId, lead: { title: lead.title, leadParagraph: lead.summary },
      highlights: [second.itemId, third.itemId], sections: [{ label: "模型", items: [lead] }, { label: "研究", items: [second, third] }] } as never)}, ${at}, 'manual')`;

  read.length = 0;
  const first = await refreshVideos();
  assert.ok(first.rendered.includes(`daily/${DAILY}`), "a published daily gets its broadcast");
  const [video] = (await listVideos()).daily.filter((v) => v.key === DAILY);
  assert.ok(video, "the video is listed");
  assert.equal(video.headline, lead.title);
  assert.deepEqual([video.clips, video.pictures], [1, 1], "the lead plays its video, the second shows its picture, the third is text");
  const scenes = scenesOf((await loadReport("daily", DAILY))!);
  assert.deepEqual(read, scenes.map(narration), "every screen is read aloud");
  assert.match(read[1]!, new RegExp(`^1。${lead.title}。`), "the lead is read first");
  assert.match(read.at(-1)!, /我们明天见。$/);

  const info = probe(fileOf(video.video));
  assert.deepEqual(info.streams.map((s: { codec_type: string }) => s.codec_type).sort(), ["audio", "video"], "a picture and its narration");
  assert.deepEqual(info.streams.find((s: { codec_type: string }) => s.codec_type === "video"), { codec_type: "video", codec_name: "h264", width: 1080, height: 1920 });
  assert.ok(Math.abs(Number(info.format.duration) - video.durationSeconds) <= 1, "the listed length is the file's");
  // Each screen fades in (all but the first), is held while it is read and a pause after, and fades out
  // over the next one.
  const shots = read.map((text, i) => (i ? 0.5 : 0) + Math.max(1, [...text].length / 20) + 0.6 + 0.5);
  const starts = shots.map((_, i) => shots.slice(0, i).reduce((n, s) => n + s, 0) - 0.5 * i);
  assert.ok(Math.abs(Number(info.format.duration) - (starts.at(-1)! + shots.at(-1)!)) < 0.2, "the video lasts as long as it is read");
  assert.ok(existsSync(fileOf(video.poster)), "the poster is written with it");
  assert.ok(await boxBrightness(fileOf(video.video), starts[1]! + 1) > 60, "the lead's video plays in its box");
  assert.ok(await boxBrightness(fileOf(video.video), starts[2]! + 1) > 150, "the second's picture fills its box");
  assert.ok(await boxBrightness(fileOf(video.video), 1) < 60, "the cover has none");

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

  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${third.itemId}`;
  read.length = 0;
  assert.ok((await refreshVideos()).rendered.includes(`daily/${DAILY}`), "the changed issue is rendered again");
  assert.ok(!read.some((text) => text.includes(third.title)), "the withdrawn report is not read");
  const [after] = (await listVideos()).daily.filter((v) => v.key === DAILY);
  assert.notEqual(after!.video, video.video, "the new video has a new address");
  assert.ok(!existsSync(fileOf(video.video)) && !existsSync(fileOf(video.poster)), "the old files are removed");
  assert.equal((await app.inject({ method: "GET", url: video.video })).statusCode, 404);

  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ANY(${[lead.itemId, second.itemId]}::text[])`;
  assert.ok((await refreshVideos()).removed.includes(`daily/${DAILY}`), "an issue with nothing left to show loses its video");
  assert.ok(!existsSync(fileOf(after!.video)));
});

test("a weekly goes theme by theme and links its issue; a source without full text lends nothing", async (t) => {
  // The report index is kept for a minute; this run reads one made after the issue.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 600_001 });
  const a = await citation("芯片出口规则调整");
  const b = await citation("两家公司宣布合并", { video: true, picture: true, from: summaryOnly });
  const c = await citation("新模型登顶评测榜");
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('weekly', ${WEEKLY}, ${at}, ${at}, ${sql.json({ overview: "本周的两条主线。", themes: [
      { heading: "政策", summary: "监管的变化。", storyRefs: [a, b] }, { heading: "模型", summary: null, storyRefs: [c] }] } as never)}, ${at}, 'manual')`;
  const scenes = scenesOf((await loadReport("weekly", WEEKLY))!);
  assert.deepEqual(scenes.map((s) => s.type), ["cover", "theme", "entry", "entry", "theme", "entry", "outro"]);
  const outro = scenes.at(-1)!;
  assert.equal(outro.type === "outro" && new URL(outro.url).pathname, `/weekly/${WEEKLY}`);
  assert.match(narration(scenes[1]!), /^本周主线1，政策。监管的变化。$/);
  assert.ok((await refreshVideos()).rendered.includes(`weekly/${WEEKLY}`));
  const [video] = (await listVideos()).weekly.filter((v) => v.key === WEEKLY);
  assert.equal(video!.period, "2月23日—3月1日");
  assert.equal(video!.headline, null, "a weekly without a headline of its own leads with none");
  assert.deepEqual([video!.clips, video!.pictures], [0, 0], "the summary-only source's video and picture are not used");
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

test("the voice model reads Chinese aloud, where it has been fetched", async (t) => {
  if (!existsSync(path.join(VOICE_DIR, "model.onnx"))) return t.skip("voice model not fetched (scripts/fetch-voice.ts)");
  const file = path.join(fixtures, "speech.wav");
  const [seconds] = await realSpeak([{ text: "这里是日报，本期一共八条。", file }]);
  assert.ok(seconds! > 1 && seconds! < 6, `a short sentence takes a few seconds (${seconds})`);
  assert.equal(probe(file).streams[0].codec_type, "audio");
});

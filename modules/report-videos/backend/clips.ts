// Videos of the news itself. A report's body keeps the native videos of its page (content/video.ts);
// a screen about it may play one when its source lets the site show the report in full, the rule the
// daily's cover picture follows. The report's own video comes first, then one of another public report
// of its event (first-hand first). Files are fetched through the guarded fetch (no private addresses,
// every redirect checked) and checked with ffprobe; one that cannot be read leaves the screen in text.
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";
import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { listedCondition } from "@aihot/backend/publication/scope";

const run = promisify(execFile);

/** Larger files are left alone: a screen plays at most CLIP_SECONDS of one. */
const CLIP_BYTES = 80 * 1024 * 1024;
/** The longest a screen plays a video for. */
export const CLIP_SECONDS = 15;

/** The first playable file of a body's native videos (an absolute http(s) address; no stream playlists). */
export function videoSource(html: string): string | null {
  const $ = load(html);
  for (const el of $("video").toArray()) {
    const video = $(el);
    const sources = video.children("source").toArray()
      .filter((s) => !$(s).attr("type") || /^video\/(mp4|webm|quicktime)\b/i.test($(s).attr("type")!))
      .map((s) => $(s).attr("src"));
    for (const src of [video.attr("src"), ...sources]) {
      if (!src?.trim()) continue;
      try {
        const url = new URL(src.trim());
        if (/^https?:$/.test(url.protocol) && !/\.m3u8$/i.test(url.pathname)) return url.toString();
      } catch {
        // not an absolute address
      }
    }
  }
  return null;
}

/** For each of the items that has one, the video a screen about it may play. */
export async function findClips(itemIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!itemIds.length) return out;
  const rows = await sql<{ id: string; body_html: string }[]>`
    SELECT wanted.id, a.body_html
    FROM unnest(${itemIds}::text[]) AS wanted(id)
    JOIN publications w ON w.article_id = wanted.id
    JOIN publications p ON p.article_id = w.article_id OR (w.story_id IS NOT NULL AND p.story_id = w.story_id)
    JOIN articles a ON a.id = p.article_id
    WHERE ${listedCondition(new Date())} AND p.body_mode = 'full' AND a.body_html ILIKE '%<video%'
    ORDER BY wanted.id, (p.article_id = wanted.id) DESC, p.first_party DESC, coalesce(p.score, 0) DESC, p.article_id`;
  for (const r of rows) {
    if (out.has(r.id)) continue;
    const src = videoSource(r.body_html);
    if (src) out.set(r.id, src);
  }
  return out;
}

/** Downloads a video to `file`; its length in seconds, or null when it is not a video ffmpeg can read. */
export async function fetchClip(url: string, file: string): Promise<number | null> {
  try {
    const res = await guardedFetch(url, { timeoutMs: 90_000, maxBytes: CLIP_BYTES, headers: { accept: "video/*" } });
    if (res.status !== 200) return null;
    await writeFile(file, res.body);
    const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type:format=duration", "-of", "json", file]);
    const info = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
    const seconds = Number(info.format?.duration);
    return info.streams?.[0]?.codec_type === "video" && seconds >= 1 ? seconds : null;
  } catch {
    return null;
  }
}

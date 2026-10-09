// The news' own videos and pictures. A report's body keeps the native videos of its page
// (content/video.ts) and its pictures are listed with it (articles.media); a screen about it may show
// them when its source lets the site show the report in full, the rule the daily's cover picture
// follows. The report's own come first, then those of another public report of its event (first-hand
// first). Files are fetched through the guarded fetch (no private addresses, every redirect checked);
// one that cannot be read leaves the screen to the next choice: video, picture, text.
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";
import sharp from "sharp";
import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { listedCondition } from "@aihot/backend/publication/scope";

const run = promisify(execFile);

/** Larger videos are left alone: a screen plays at most a narration's length of one. */
const CLIP_BYTES = 80 * 1024 * 1024;
const PICTURE_BYTES = 15 * 1024 * 1024;

export interface NewsMedia {
  video: string | null;
  image: string | null;
}

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

/** For each of the items that has any, the video and the picture a screen about it may show. */
export async function findMedia(itemIds: string[]): Promise<Map<string, NewsMedia>> {
  const out = new Map<string, NewsMedia>();
  if (!itemIds.length) return out;
  // A sizeable picture, as the daily's cover takes one (publication/reports.ts leadCover).
  const rows = await sql<{ id: string; body_html: string | null; image: string | null }[]>`
    SELECT wanted.id, CASE WHEN a.body_html ILIKE '%<video%' THEN a.body_html END AS body_html,
      (SELECT m->>'url' FROM jsonb_array_elements(coalesce(a.media, '[]'::jsonb)) m
       WHERE m->>'kind' = 'image' AND coalesce((m->>'width')::numeric, 800) >= 480 LIMIT 1) AS image
    FROM unnest(${itemIds}::text[]) AS wanted(id)
    JOIN publications w ON w.article_id = wanted.id
    JOIN publications p ON p.article_id = w.article_id OR (w.story_id IS NOT NULL AND p.story_id = w.story_id)
    JOIN articles a ON a.id = p.article_id
    WHERE ${listedCondition(new Date())} AND p.body_mode = 'full'
    ORDER BY wanted.id, (p.article_id = wanted.id) DESC, p.first_party DESC, coalesce(p.score, 0) DESC, p.article_id`;
  for (const r of rows) {
    const found = out.get(r.id) ?? { video: null, image: null };
    found.video ??= r.body_html ? videoSource(r.body_html) : null;
    found.image ??= r.image && /^https?:\/\//i.test(r.image) ? r.image : null;
    out.set(r.id, found);
  }
  for (const [id, found] of out) if (!found.video && !found.image) out.delete(id);
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

/** A picture filling a box of the given size (cropped to it), or null when it cannot be fetched or read. */
export async function fetchPicture(url: string, size: { width: number; height: number }): Promise<Buffer | null> {
  try {
    const res = await guardedFetch(url, { timeoutMs: 30_000, maxBytes: PICTURE_BYTES, headers: { accept: "image/*" } });
    if (res.status !== 200) return null;
    return await sharp(res.body).rotate().resize(size.width, size.height, { fit: "cover" }).png().toBuffer();
  } catch {
    return null;
  }
}

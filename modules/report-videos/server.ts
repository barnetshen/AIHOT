// The backend of the broadcast videos: the worker renders them (backend/videos.ts), the api lists them
// and sends their files, with byte ranges so players can seek.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { sendJsonWithEtag } from "@aihot/api/http/respond";
import { FILE_NAME, listVideos, refreshVideos, VIDEO_DIR, videoFindings } from "./backend/videos.ts";

/** A video's address changes with what it shows; a withdrawal removes the old file within minutes, so caches keep it no longer. */
const FILE_CACHE = "public, max-age=300";

async function sendVideoFile(req: FastifyRequest, reply: FastifyReply, name: string) {
  const match = FILE_NAME.exec(name);
  const file = path.join(VIDEO_DIR, name);
  const size = match ? await stat(file).then((s) => s.size, () => null) : null;
  if (size === null) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  reply.header("Content-Type", match![4] === "mp4" ? "video/mp4" : "image/jpeg").header("Cache-Control", FILE_CACHE)
    .header("Accept-Ranges", "bytes").header("ETag", `"${name}"`);
  if (req.headers["if-none-match"] === `"${name}"`) return reply.code(304).send();
  // One range ("bytes=a-b", "bytes=a-", "bytes=-n"); anything else gets the whole file.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end) return reply.code(416).header("Content-Range", `bytes */${size}`).send();
    reply.code(206).header("Content-Range", `bytes ${start}-${end}/${size}`).header("Content-Length", end - start + 1);
    return reply.send(createReadStream(file, { start, end }));
  }
  return reply.header("Content-Length", size).send(createReadStream(file));
}

export default defineServerModule({
  name: "report-videos",
  http: (app) => {
    app.get("/api/videos", async (req, reply) =>
      sendJsonWithEtag(req, reply, await listVideos(), { etagPrefix: "videos", cacheControl: "public, max-age=60, must-revalidate" }));
    app.get("/api/videos/files/:name", (req, reply) => sendVideoFile(req, reply, (req.params as { name: string }).name));
  },
  // Every ten minutes: a new issue gets its broadcast within minutes, a withdrawal takes it down.
  schedules: [{ name: "videos.render", cron: "*/10 * * * *", run: refreshVideos }],
  alerts: videoFindings,
  sitemap: { pages: [{ loc: "/videos", changefreq: "daily", priority: 0.5 }] },
});

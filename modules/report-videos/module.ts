// Broadcast videos of the daily and the weekly: a vertical MP4 each, read aloud and shown with the news'
// own videos and pictures, rendered by the worker from the published issue (backend/videos.ts) and
// listed on /videos.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "report-videos",
  // One broadcast's own address (/videos/daily/2026-10-08) is what is shared: its preview shows its cover.
  pages: [{ path: "videos", file: "web/videos.tsx" }, { path: "videos/:kind/:key", file: "web/videos.tsx", id: "videos-one" }],
  apiPaths: [/^\/api\/videos(?:\/|$)/],
});

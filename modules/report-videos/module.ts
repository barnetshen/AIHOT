// Broadcast videos of the daily and the weekly: a vertical MP4 each, read aloud and shown with the news'
// own videos and pictures, rendered by the worker from the published issue (backend/videos.ts) and
// listed on /videos.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "report-videos",
  pages: [{ path: "videos", file: "web/videos.tsx" }],
  apiPaths: [/^\/api\/videos(?:\/|$)/],
});

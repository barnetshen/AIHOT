// News videos: a vertical MP4 for each selected item, daily and weekly, rendered by the worker from
// what the public read layer shows (backend/videos.ts) and watched as a feed on /videos.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "report-videos",
  pages: [{ path: "videos", file: "web/videos.tsx" }],
  apiPaths: [/^\/api\/videos(?:\/|$)/],
});

// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import reportVideos from "@aihot/report-videos/web";

export const WEB_MODULES: readonly WebModule[] = [reportVideos];

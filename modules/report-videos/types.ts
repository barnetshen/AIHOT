// What the api answers at /api/videos, read by the page (web/videos.tsx).

export type VideoKind = "daily" | "weekly";

export interface VideoEntry {
  kind: VideoKind;
  /** The issue's date or week. */
  key: string;
  issueNumber: number;
  title: string;
  /** What the issue leads with. */
  headline: string | null;
  /** "10月7日 星期三", "10月5日—10月11日". */
  period: string;
  durationSeconds: number;
  bytes: number;
  /** Screens that play a video of the news itself, and screens that show its picture. */
  clips: number;
  pictures: number;
  video: string;
  poster: string;
  /** The issue's page. */
  page: string;
  renderedAt: string;
}

/** Newest first by kind. */
export interface VideosResponse {
  daily: VideoEntry[];
  weekly: VideoEntry[];
}

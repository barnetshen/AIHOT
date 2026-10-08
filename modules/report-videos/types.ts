// What the api answers at /api/videos, read by the page (web/videos.tsx).

/** An issue (daily, weekly) or one selected item. */
export type VideoKind = "daily" | "weekly" | "item";

export interface VideoEntry {
  kind: VideoKind;
  /** The issue's date or week, the item's id. */
  key: string;
  /** An issue's number; null for an item. */
  issueNumber: number | null;
  /** An issue's title, the item's headline. */
  title: string;
  /** What an issue leads with; null for an item. */
  headline: string | null;
  /** "10月7日 星期三", "10月5日—10月11日", "10月8日 14:30". */
  period: string;
  durationSeconds: number;
  bytes: number;
  /** How many of its screens play a video of the news itself. */
  clips: number;
  video: string;
  poster: string;
  /** The issue's or the item's page. */
  page: string;
  renderedAt: string;
}

/** Newest first by kind. */
export interface VideosResponse {
  daily: VideoEntry[];
  weekly: VideoEntry[];
  items: VideoEntry[];
}

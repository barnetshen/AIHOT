// What the site's own pages show of a broadcast (web/home.tsx, web/videos.tsx): the player's address for
// it, its length and how many news entries it tells.
import type { VideoEntry } from "../types.ts";

/** The player, opened on this broadcast: its own address, which is also what is shared. */
export const playerUrl = (v: Pick<VideoEntry, "kind" | "key">) => `/videos/${v.kind}/${v.key}`;

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** How many news entries a broadcast tells. */
export const entries = (v: VideoEntry) => v.chapters.filter((c) => c.rank).length;

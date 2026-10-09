// What the site's own pages show of the broadcasts (web/bubble.tsx, web/home.tsx): the list, read once a
// visit in the browser from /api/videos, and the player's address for one of them.
import { useEffect, useState } from "react";
import type { VideoEntry, VideosResponse } from "../types.ts";

/** Fetched once a visit: the list changes a few times a day. */
let loaded: Promise<VideosResponse | null> | null = null;
const load = () => (loaded ??= fetch("/api/videos").then((r) => (r.ok ? (r.json() as Promise<VideosResponse>) : null), () => null));

/** The broadcasts, once the browser has them (null until then, and on the server). */
export function useVideos(): VideosResponse | null {
  const [videos, setVideos] = useState<VideosResponse | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((v) => live && setVideos(v));
    return () => {
      live = false;
    };
  }, []);
  return videos;
}

/** The player, opened on this broadcast. */
export const playerUrl = (v: VideoEntry) => `/videos?${new URLSearchParams({ ...(v.kind === "weekly" ? { kind: "weekly" } : {}), v: v.key })}`;

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** How many news entries a broadcast tells. */
export const entries = (v: VideoEntry) => v.chapters.filter((c) => c.rank).length;

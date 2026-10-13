// What the site's own pages show of the broadcasts (web/bubble.tsx, web/home.tsx): the list as the
// floating card reads it, once a visit in the browser from /api/videos, and the player's address for one.
import { useEffect, useState } from "react";
import type { VideoEntry, VideosResponse } from "../types.ts";

/** Fetched once a visit: the list changes a few times a day. */
let loaded: Promise<VideosResponse | null> | null = null;
const load = () => (loaded ??= fetch("/api/videos").then((r) => (r.ok ? (r.json() as Promise<VideosResponse>) : null), () => null));

/** The broadcasts, once the browser has them (null until then, on the server, and where not `wanted`). */
export function useVideos(wanted: boolean): VideosResponse | null {
  const [videos, setVideos] = useState<VideosResponse | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void load().then((v) => live && setVideos(v));
    return () => {
      live = false;
    };
  }, [wanted]);
  return wanted ? videos : null;
}

/** The player, opened on this broadcast: its own address, which is also what is shared. */
export const playerUrl = (v: Pick<VideoEntry, "kind" | "key">) => `/videos/${v.kind}/${v.key}`;

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** How many news entries a broadcast tells. */
export const entries = (v: VideoEntry) => v.chapters.filter((c) => c.rank).length;

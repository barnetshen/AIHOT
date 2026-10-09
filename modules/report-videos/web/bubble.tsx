// A small floating card on the report pages that opens the broadcast: the issue's own on a report page,
// the newest daily's on the latest daily, the newest weekly's on the latest weekly (the home page has
// the broadcasts in its own strip, web/home.tsx). A poster; on a wide screen the issue's headline opens beside it for its first seconds
// and under the pointer. It slides mostly out of the way while the page scrolls, and closing it hides it
// until a newer broadcast comes out. Drawn only in the browser, from /api/videos.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { IconClose } from "@aihot/web/components/icons";
import type { VideoEntry, VideosResponse } from "../types.ts";
import { clock, entries, playerUrl, useVideos } from "./shared.ts";

const CLOSED_KEY = "videos.bubble.closed";
/** How long after the page stops scrolling the card comes back. */
const SETTLE_MS = 700;
/** How long the headline shows on a wide screen before it folds away. */
const PEEK_MS = 5000;

const STYLES = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes vb-in { from { opacity: 0; transform: translateY(18px) scale(.9) } to { opacity: 1; transform: none } }
  @keyframes vb-drift { from { transform: scale(1) } to { transform: scale(1.08) translateY(-3%) } }
  @keyframes vb-ping { 0% { transform: scale(1); opacity: .7 } 80%,100% { transform: scale(2.4); opacity: 0 } }
  .vb-in { animation: vb-in .5s cubic-bezier(.2,.9,.3,1.15) both }
  .vb-drift { animation: vb-drift 7s ease-in-out infinite alternate }
  .vb-ping { animation: vb-ping 1.6s cubic-bezier(0,0,.2,1) infinite }
}
`;

function pick(videos: VideosResponse, pathname: string): VideoEntry | null {
  if (pathname === "/daily") return videos.daily[0] ?? null;
  if (pathname === "/weekly") return videos.weekly[0] ?? null;
  return [...videos.daily, ...videos.weekly].find((v) => v.page === pathname) ?? null;
}

/** The newest broadcast: closing the card lasts until it changes. */
const newest = (videos: VideosResponse) => [...videos.daily, ...videos.weekly].reduce<VideoEntry | null>((a, v) => (!a || v.renderedAt > a.renderedAt ? v : a), null)?.video ?? "";

export function VideoBubble() {
  const { pathname } = useLocation();
  const videos = useVideos();
  const [closed, setClosed] = useState<string | null>(null);
  const [tucked, setTucked] = useState(false);
  const [peek, setPeek] = useState(true);

  useEffect(() => {
    try {
      setClosed(localStorage.getItem(CLOSED_KEY) ?? "");
    } catch {
      setClosed("");
    }
    const t = setTimeout(() => setPeek(false), PEEK_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let timer = 0;
    const scrolled = () => {
      setTucked(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setTucked(false), SETTLE_MS);
    };
    window.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      window.removeEventListener("scroll", scrolled);
      clearTimeout(timer);
    };
  }, []);

  const v = videos && pick(videos, pathname);
  if (!videos || !v || closed === null || closed === newest(videos)) return null;

  const close = () => {
    const key = newest(videos);
    setClosed(key);
    try {
      localStorage.setItem(CLOSED_KEY, key);
    } catch {
      // storage blocked: hidden until the page reloads
    }
  };
  const to = playerUrl(v);
  const kind = v.kind === "daily" ? "日报" : "周报";
  return (
    <div
      className={`fixed right-3 z-30 bottom-[calc(84px+env(safe-area-inset-bottom))] transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none lg:bottom-[5.25rem] lg:right-6 ${tucked ? "translate-x-[calc(100%-1.25rem)]" : ""}`}
    >
      <style>{STYLES}</style>
      <div className="vb-in group relative">
        <Link
          to={to}
          aria-label={`看${kind}视频播报：${v.headline ?? v.title}`}
          className="flex items-center rounded-2xl lg:border lg:border-line lg:bg-surface lg:p-1.5 lg:shadow-[var(--shadow-soft)] lg:transition-shadow lg:hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
        >
          <span className="relative block aspect-[9/16] w-[68px] shrink-0 overflow-hidden rounded-[14px] bg-black shadow-[0_8px_24px_rgba(0,0,0,0.28)] ring-2 ring-white lg:w-[58px] lg:rounded-xl lg:shadow-none lg:ring-0">
            <img src={v.poster} alt="" className="vb-drift size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
            <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 pl-0.5 text-black transition-transform group-hover:scale-110">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
            </span>
            <span className="num absolute bottom-1 inset-x-0 text-center text-[10px] font-medium text-white">{clock(v.durationSeconds)}</span>
          </span>
          <span className={`hidden overflow-hidden transition-[max-width,opacity] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none lg:block lg:group-hover:max-w-[15rem] lg:group-hover:opacity-100 lg:group-focus-within:max-w-[15rem] lg:group-focus-within:opacity-100 ${peek ? "max-w-[15rem] opacity-100" : "max-w-0 opacity-0"}`}>
            <span className="block w-[15rem] pl-3 pr-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent">
                <span className="relative flex size-1.5">
                  <span className="vb-ping absolute inset-0 rounded-full bg-accent" />
                  <span className="relative size-1.5 rounded-full bg-accent" />
                </span>
                {kind}视频播报
              </span>
              <span className="mt-1 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">{v.headline ?? v.title}</span>
              <span className="mt-1 block text-[11.5px] text-ink-3">{v.period} · {entries(v)} 条要闻</span>
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label="不再显示"
          className="absolute -left-2 -top-2 flex size-6 items-center justify-center rounded-full bg-black/70 text-white shadow transition-opacity lg:left-auto lg:-right-2 lg:bg-ink lg:text-surface lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  );
}

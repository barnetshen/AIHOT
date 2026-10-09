// The broadcasts as a short-video app: full screen, one video a screen, swipe (or ↑ ↓) to the next.
// The one in view plays and moves on to the next when it ends; tapping pauses it. Browsers only let a
// page start videos by itself without sound, so they start muted until the reader turns the sound on,
// which then stays on for the rest of the feed.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { EDITION_WHEN, SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { copyText } from "@aihot/web/lib/clipboard";
import { IconArrowLeft, IconDoc, IconDownload, IconShare } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { VideoEntry, VideoKind, VideosResponse } from "../types.ts";

export const handle: Screen = { tab: "daily", name: "视频播报", bare: true };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(60, await apiGet<VideosResponse>("/api/videos", { signal: request.signal }));
}

const TITLE = `${withSubject("日报")}视频播报`;

export function meta() {
  return pageMeta({
    title: TITLE,
    description: `${SITE.name} 的日报与周报视频播报：主播口播每条要闻，配新闻自带的视频和图片，几分钟听完当天和本周，每条都可回到图文版看原文链接。`,
    path: "/videos",
  });
}

const KINDS: Array<{ kind: VideoKind; label: string; when: string }> = [
  { kind: "daily", label: "日报", when: EDITION_WHEN.daily },
  { kind: "weekly", label: "周报", when: EDITION_WHEN.weekly },
];

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function IconPlay({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function IconSound({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {on ? <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

/** A round button of the right-hand column, with its label under it. */
function Action({ label, children, ...rest }: { label: string; children: ReactNode } & ({ to: string } | { href: string; download?: boolean } | { onClick: () => void })) {
  const inner = (
    <>
      <span className="flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-colors group-hover:bg-white/25">{children}</span>
      <span className="text-[11.5px] font-medium [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{label}</span>
    </>
  );
  const cls = "group flex flex-col items-center gap-1";
  if ("to" in rest) return <Link to={rest.to} className={cls}>{inner}</Link>;
  if ("href" in rest) return <a href={rest.href} download={rest.download} className={cls}>{inner}</a>;
  return <button type="button" onClick={rest.onClick} className={cls}>{inner}</button>;
}

interface SlideProps {
  v: VideoEntry;
  active: boolean;
  /** The next one, fetched ahead so a swipe starts at once. */
  near: boolean;
  muted: boolean;
  onEnded: () => void;
  onShare: (v: VideoEntry) => void;
}

function Slide({ v, active, near, muted, onEnded, onShare }: SlideProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active) {
      setPaused(false);
      // A refusal (sound on without a tap since the page opened) leaves it paused, showing the play button.
      video.play().catch(() => setPaused(true));
    } else video.pause();
  }, [active]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().then(() => setPaused(false), () => setPaused(true));
    else {
      video.pause();
      setPaused(true);
    }
  };

  const seek = (e: MouseEvent<HTMLDivElement>) => {
    const video = ref.current;
    if (!video?.duration) return;
    const box = e.currentTarget.getBoundingClientRect();
    video.currentTime = ((e.clientX - box.left) / box.width) * video.duration;
  };

  const headline = v.headline ?? v.title;
  const extras = [v.clips > 0 && `${v.clips} 段原视频`, v.pictures > 0 && `${v.pictures} 张新闻图`].filter(Boolean).join(" · ");
  return (
    <section data-slide={v.key} className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black">
      {/* Beside a narrow video (a wide screen), its own cover, blurred, fills the rest. */}
      <div aria-hidden="true" className="absolute inset-0 scale-110 bg-cover bg-center opacity-50 blur-3xl" style={{ backgroundImage: `url(${v.poster})` }} />
      <video
        ref={ref}
        playsInline
        muted={muted}
        preload={active || near ? "auto" : "none"}
        poster={v.poster}
        src={v.video}
        onClick={toggle}
        onEnded={onEnded}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        aria-label={headline}
        className="relative mx-auto h-full w-full max-w-[calc(100dvh*9/16)] cursor-pointer object-contain"
      />
      {paused && (
        <button type="button" onClick={toggle} aria-label="播放" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/80 drop-shadow-lg">
          <IconPlay size={72} />
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/75 to-transparent" />

      {/* The right-hand column. */}
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5 sm:right-[max(0.75rem,calc(50%-100dvh*9/32-4.5rem))]">
        <Link to="/" aria-label={`${SITE.name} 首页`} className="mb-1 block size-12 overflow-hidden rounded-full border-2 border-white bg-white">
          <img src="/icon-192.png" alt="" className="size-full object-cover" />
        </Link>
        <Action label="图文" to={v.page}><IconDoc size={22} /></Action>
        <Action label="分享" onClick={() => onShare(v)}><IconShare size={22} /></Action>
        <Action label="下载" href={v.video} download><IconDownload size={22} /></Action>
      </div>

      {/* What it is, bottom left. */}
      <div className="absolute bottom-7 left-4 right-24 sm:left-[max(1rem,calc(50%-100dvh*9/32+1rem))] sm:right-[max(6rem,calc(50%-100dvh*9/32+5rem))]">
        <div className="text-[16px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">@{SITE.name}</div>
        <p className="mt-1.5 line-clamp-3 text-[14.5px] leading-[1.5] [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{headline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/80">
          <span>{v.period}</span>
          <span>第 {v.issueNumber} 期</span>
          <span className="num">{minutes(v.durationSeconds)}</span>
          {extras && <span>{extras}</span>}
        </div>
        <Link to={v.page} className="mt-2.5 inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-[12px] backdrop-blur-md hover:bg-white/25">
          <IconDoc size={13} />看图文版和原文链接
        </Link>
      </div>

      {/* Progress: tap or click anywhere along it to jump there. */}
      <div onClick={seek} className="absolute inset-x-0 bottom-0 flex h-4 cursor-pointer items-end sm:mx-auto sm:max-w-[calc(100dvh*9/16)]">
        <div className="h-[3px] w-full bg-white/20">
          <div className="h-full bg-white/90" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </section>
  );
}

export default function VideosPage() {
  const videos = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const current = KINDS.find((k) => k.kind === params.get("kind")) ?? KINDS[0]!;
  const list = videos[current.kind];
  const feed = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const slides = () => [...(feed.current?.querySelectorAll<HTMLElement>("[data-slide]") ?? [])];
  const go = (i: number) => slides()[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  // The slide most in view is the one that plays.
  useEffect(() => {
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(slides().indexOf(e.target as HTMLElement));
    }, { root: feed.current, threshold: 0.6 });
    for (const s of slides()) seen.observe(s);
    // A shared address (?v=<key>) opens on its video.
    const shared = slides().findIndex((s) => s.dataset.slide === params.get("v"));
    if (shared > 0) slides()[shared]!.scrollIntoView({ block: "start" });
    return () => seen.disconnect();
  }, [current.kind]);

  // ↑ ↓ and the space bar on a keyboard.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        go(active + (e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === " ") {
        e.preventDefault();
        slides()[active]?.querySelector("video")?.click();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const share = async (v: VideoEntry) => {
    const url = `${location.origin}/videos?${new URLSearchParams({ ...(v.kind === "weekly" ? { kind: "weekly" } : {}), v: v.key })}`;
    const text = `${v.headline ?? v.title} — ${SITE.name}${v.kind === "daily" ? "日报" : "周报"}视频播报`;
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        // dismissed, or not allowed here: copy instead
      }
    }
    await copyText(url);
    setToast("链接已复制");
  };

  const unmute = () => {
    setMuted(false);
    // The tap lets this video play with sound.
    const video = slides()[active]?.querySelector("video");
    if (video) {
      video.muted = false;
      video.play().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-white">
      <h1 className="sr-only">{TITLE}</h1>
      <div ref={feed} key={current.kind} className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((v, i) => (
          <Slide key={v.key} v={v} active={i === active} near={i === active + 1} muted={muted} onEnded={() => go(i + 1)} onShare={share} />
        ))}
        {!list.length && (
          <div className="flex h-dvh flex-col items-center justify-center px-8 text-center">
            <p className="text-[17px] font-semibold">还没有{current.label}视频播报</p>
            <p className="mt-2 text-[13px] text-white/60">{current.label}{current.when}出刊后，视频会在几分钟内出现在这里。</p>
          </div>
        )}
      </div>

      {/* Top: back to the site, the two feeds, the sound. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-3 pt-[env(safe-area-inset-top)]">
        <Link to="/" aria-label="返回网站" className="pointer-events-auto flex size-10 items-center justify-center rounded-full hover:bg-white/15">
          <IconArrowLeft size={22} />
        </Link>
        <nav aria-label="视频类型" className="pointer-events-auto flex gap-6">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-current={current.kind === k.kind ? "page" : undefined}
              onClick={() => {
                setActive(0);
                setParams(k.kind === KINDS[0]!.kind ? {} : { kind: k.kind }, { replace: true, preventScrollReset: true });
              }}
              className={`relative pb-1.5 text-[16.5px] transition-colors [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] ${current.kind === k.kind ? "font-semibold text-white" : "text-white/60 hover:text-white/85"}`}
            >
              {k.label}
              {current.kind === k.kind && <span className="absolute inset-x-1.5 bottom-0 h-[2.5px] rounded-full bg-white" />}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => (muted ? unmute() : setMuted(true))}
          aria-label={muted ? "打开声音" : "关闭声音"}
          className={`pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] ${muted ? "bg-white/20 backdrop-blur-md" : "hover:bg-white/15"}`}
        >
          <IconSound on={!muted} />
          {muted && "开声音"}
        </button>
      </div>

      {toast && (
        <div role="status" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/75 px-4 py-2.5 text-[14px]">{toast}</div>
      )}
    </div>
  );
}

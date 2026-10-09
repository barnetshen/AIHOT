// The broadcasts as a short-video app: full screen, one broadcast a screen, swipe (or ↑ ↓) to the next.
// The one in view plays and moves on to the next when it ends. On a broadcast: a tap pauses or plays,
// holding plays it at double speed, the progress bar can be dragged (with the entry under it named), and
// its chapters (one per news entry) open in a sheet, from the chip over the caption or the column on the
// right (← → step through them on a keyboard). Browsers only let a page start videos by itself without
// sound, so they start muted until the reader turns the sound on, which then stays on for the feed.
// The next broadcast is announced over the last seconds of one; the last ends on a card.
// Motion follows the reader's reduced-motion setting.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { EDITION_WHEN, SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { copyText } from "@aihot/web/lib/clipboard";
import { IconArrowLeft, IconChevronDown, IconDoc, IconDownload, IconList, IconShare } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { Chapter, VideoEntry, VideoKind, VideosResponse } from "../types.ts";

export const handle: Screen = { tab: "videos", name: "视频播报", bare: true };
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

/** Held this long, a press plays at double speed instead of pausing. */
const HOLD_MS = 420;
/** A press that moves this far is a swipe, not a tap. */
const SLOP = 10;
const HINT_KEY = "videos.swiped";
/** Seconds before the end the next broadcast is announced. */
const UP_NEXT = 5;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const chapterAt = (chapters: Chapter[], t: number) => chapters.findLastIndex((c) => c.at <= t + 0.05);
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Keyframes of the page's own motion; none of it plays for readers who asked for less. */
const STYLES = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes vp-pop { 0% { opacity: 0; transform: translate(-50%,-50%) scale(1.6) } 25% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1) } }
  @keyframes vp-bar { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
  @keyframes vp-hint { 0%,100% { transform: translateY(0); opacity: .9 } 50% { transform: translateY(-14px); opacity: .5 } }
  @keyframes vp-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.35) } 50% { box-shadow: 0 0 0 7px rgba(255,255,255,0) } }
  @keyframes vp-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
  @keyframes vp-slide { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
  .vp-slide { animation: vp-slide .4s cubic-bezier(.2,.8,.2,1) both }
  .vp-pop { animation: vp-pop .7s cubic-bezier(.2,.8,.2,1) forwards }
  .vp-bar { animation: vp-bar .9s ease-in-out infinite; transform-origin: bottom }
  .vp-hint { animation: vp-hint 1.4s ease-in-out infinite }
  .vp-glow { animation: vp-glow 2s ease-out infinite }
  .vp-in { animation: vp-in .35s cubic-bezier(.2,.8,.2,1) both }
}
`;

function IconPlay({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function IconPause({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="5.5" width="4" height="13" rx="1" /><rect x="13.5" y="5.5" width="4" height="13" rx="1" />
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

/** Three bars that rise and fall: the chapter now playing. */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden="true" className="inline-flex h-3 items-end gap-[2px]">
      {[0, 0.25, 0.5].map((delay) => (
        <span key={delay} className={`w-[3px] rounded-full bg-current ${playing ? "vp-bar" : ""}`} style={{ height: "100%", animationDelay: `${delay}s`, transform: playing ? undefined : "scaleY(.4)" }} />
      ))}
    </span>
  );
}

/** A round button of the right-hand column, with its label under it. */
function Action({ label, children, badge, ...rest }: { label: string; children: ReactNode; badge?: number } & ({ to: string } | { href: string; download?: boolean } | { onClick: () => void })) {
  const inner = (
    <>
      <span className="relative flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-[transform,background-color] duration-150 group-hover:bg-white/25 group-active:scale-90">
        {children}
        {badge ? <span className="num absolute -right-1 -top-1 min-w-5 rounded-full bg-white px-1 text-center text-[11px] font-semibold leading-5 text-black">{badge}</span> : null}
      </span>
      <span className="text-[11.5px] font-medium [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{label}</span>
    </>
  );
  const cls = "group flex flex-col items-center gap-1 outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-white";
  if ("to" in rest) return <Link to={rest.to} className={cls}>{inner}</Link>;
  if ("href" in rest) return <a href={rest.href} download={rest.download} className={cls}>{inner}</a>;
  return <button type="button" onClick={rest.onClick} className={cls}>{inner}</button>;
}

interface SlideProps {
  v: VideoEntry;
  active: boolean;
  /** The next one, fetched ahead so a swipe starts at once. */
  near: boolean;
  /** What plays after it; the last one ends on a card instead. */
  next: VideoEntry | null;
  muted: boolean;
  onNext: () => void;
  onShare: (v: VideoEntry) => void;
  /** The last one's card: what this feed is, and the way to the other feed. */
  feed: { label: string; when: string; count: number; other: string; onOther: () => void };
}

function Slide({ v, active, near, next, muted, onNext, onShare, feed }: SlideProps) {
  const root = useRef<HTMLElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fast, setFast] = useState(false);
  /** The icon that pops when a tap pauses or plays, keyed so each tap replays it. */
  const [pop, setPop] = useState<{ icon: "play" | "pause"; n: number } | null>(null);
  const [chapter, setChapter] = useState(-1);
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /** While the progress bar is dragged: the fraction under the finger. */
  const [scrub, setScrub] = useState<number | null>(null);
  const [duration, setDuration] = useState(v.durationSeconds);
  /** Whole seconds left while the next one is announced. */
  const [left, setLeft] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const press = useRef<{ x: number; y: number; timer: number; held: boolean } | null>(null);
  const chapters = v.chapters;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active) {
      setPaused(false);
      setEnded(false);
      // A refusal (sound on without a tap since the page opened) leaves it paused, showing the play button.
      video.play().catch(() => setPaused(true));
    } else {
      video.pause();
      setSheet(false);
      setLeft(null);
    }
  }, [active]);

  // The progress bar follows every frame while playing; the chapter chip only when the chapter changes.
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const video = ref.current;
      if (video?.duration && fill.current && scrub === null) {
        fill.current.style.transform = `scaleX(${video.currentTime / video.duration})`;
        setChapter(chapterAt(chapters, video.currentTime));
        const rest = video.duration - video.currentTime;
        setLeft(rest < UP_NEXT && !video.paused ? Math.ceil(rest) : null);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, chapters, scrub]);

  // Keyboard steps through the chapters and opens them; the page sends them to the slide in view.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const command = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === "toggle") toggle();
      if (what === "chapters") setSheet((open) => !open && chapters.length > 0);
      if (what === "next" || what === "prev") {
        const now = chapterAt(chapters, ref.current?.currentTime ?? 0);
        const target = chapters[what === "next" ? now + 1 : Math.max(0, now - (ref.current && ref.current.currentTime - (chapters[now]?.at ?? 0) > 2 ? 0 : 1))];
        if (target) jump(target.at);
      }
    };
    el.addEventListener("player", command);
    return () => el.removeEventListener("player", command);
  });

  const play = () => {
    const video = ref.current;
    if (!video) return;
    setEnded(false);
    video.play().then(() => setPaused(false), () => setPaused(true));
  };

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      play();
      setPop({ icon: "play", n: (pop?.n ?? 0) + 1 });
    } else {
      video.pause();
      setPaused(true);
      setPop({ icon: "pause", n: (pop?.n ?? 0) + 1 });
    }
  };

  const jump = (at: number) => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = at;
    setChapter(chapterAt(chapters, at));
    setSheet(false);
    play();
  };

  // A press on the picture: a tap pauses or plays, a hold plays at double speed until released, a swipe is left to the feed.
  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const timer = window.setTimeout(() => {
      const video = ref.current;
      if (!press.current || !video || video.paused) return;
      press.current.held = true;
      video.playbackRate = 2;
      setFast(true);
    }, HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, timer, held: false };
  };
  const release = (tap: boolean) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.held) {
      if (ref.current) ref.current.playbackRate = 1;
      setFast(false);
    } else if (tap) toggle();
  };
  const move = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && !p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) release(false);
  };

  // Dragging the progress bar: the time and the entry under the finger show while it moves; the video jumps on release.
  const fraction = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
  };
  const scrubStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrub(fraction(e));
  };
  const scrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub !== null) setScrub(fraction(e));
  };
  const scrubEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    const to = fraction(e) * duration;
    setScrub(null);
    if (fill.current) fill.current.style.transform = `scaleX(${to / duration})`;
    jump(to);
  };

  const headline = v.headline ?? v.title;
  const extras = [v.clips > 0 && `${v.clips} 段原视频`, v.pictures > 0 && `${v.pictures} 张新闻图`].filter(Boolean).join(" · ");
  const current = chapters[chapter];
  const scrubChapter = scrub === null ? null : chapters[chapterAt(chapters, scrub * duration)];
  return (
    <section ref={root} data-slide={v.key} aria-roledescription="视频" aria-label={headline} className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black">
      {/* Beside a narrow video (a wide screen), its own cover, blurred, fills the rest. */}
      <div aria-hidden="true" className="absolute inset-0 scale-110 bg-cover bg-center opacity-50 blur-3xl" style={{ backgroundImage: `url(${v.poster})` }} />
      <video
        ref={ref}
        playsInline
        muted={muted}
        preload={active || near ? "auto" : "none"}
        poster={v.poster}
        src={v.video}
        onEnded={() => {
          setLeft(null);
          if (next) onNext();
          else setEnded(true);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || v.durationSeconds)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); setFailed(false); }}
        onCanPlay={() => setBuffering(false)}
        onError={() => setFailed(true)}
        aria-label={headline}
        className="relative mx-auto h-full w-full max-w-[calc(100dvh*9/16)] object-contain"
      />
      {/* The picture's surface: taps and holds (a swipe scrolls the feed through it). */}
      <div
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => release(true)}
        onPointerCancel={() => release(false)}
        onPointerLeave={() => release(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 cursor-pointer touch-pan-y select-none [-webkit-touch-callout:none]"
      />

      {paused && !failed && (
        <button type="button" onClick={toggle} aria-label="播放" className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 pl-1 text-white/90 backdrop-blur-sm">
          <IconPlay size={44} />
        </button>
      )}
      {pop && <span key={pop.n} aria-hidden="true" className="vp-pop pointer-events-none absolute left-1/2 top-1/2 text-white opacity-0">{pop.icon === "play" ? <IconPlay size={72} /> : <IconPause size={72} />}</span>}
      {buffering && !paused && !failed && (
        <span role="status" aria-label="加载中" className="pointer-events-none absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
      )}
      {failed && (
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 text-center">
          <p className="text-[15px] font-semibold">视频暂时无法播放</p>
          <Link to={v.page} className="mt-3 inline-block rounded-full bg-white/15 px-4 py-2 text-[13px] backdrop-blur-md">先看图文版</Link>
        </div>
      )}
      {fast && (
        <div role="status" className="vp-in pointer-events-none absolute left-1/2 top-[3.75rem] -translate-x-1/2 rounded-full bg-black/45 px-3.5 py-1.5 text-[13px] font-medium backdrop-blur-md">
          2× 快进中 <span className="opacity-80">▸▸</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* The next one, announced over the last seconds; a tap goes to it now. */}
      {next && left !== null && (
        <button
          type="button"
          onClick={onNext}
          className="vp-slide absolute right-3 top-[4.25rem] flex w-[15.5rem] items-center gap-2.5 rounded-xl bg-black/55 p-2 pr-3 text-left ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-black/70 sm:right-[max(0.75rem,calc(50%-100dvh*9/32+0.75rem))]"
        >
          <span className="relative h-16 w-9 shrink-0 overflow-hidden rounded-md bg-black">
            <img src={next.poster} alt="" className="size-full object-cover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="num block text-[11px] text-white/65">{left} 秒后播放下一期</span>
            <span className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug">{next.headline ?? next.title}</span>
          </span>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0 -rotate-90">
            <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" />
            <circle cx="11" cy="11" r="9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray={56.55} strokeDashoffset={56.55 * (left / UP_NEXT)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
          </svg>
        </button>
      )}

      {/* The last one has played: start it again, or go to the other feed or back to the site. */}
      {ended && (
        <div className="vp-in absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 px-8 text-center backdrop-blur-sm">
          <div className="text-[19px] font-semibold">{feed.label}播报都看完了</div>
          <div className="mt-2 text-[13px] text-white/60">共 {feed.count} 期 · 新一期{feed.label}{feed.when} 出刊后自动生成</div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => jump(0)} className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition-transform active:scale-95">重播这一期</button>
            <button type="button" onClick={feed.onOther} className="rounded-full bg-white/15 px-5 py-2.5 text-[14px] transition-[transform,background-color] hover:bg-white/25 active:scale-95">看{feed.other}播报</button>
            <Link to={v.page} className="rounded-full bg-white/15 px-5 py-2.5 text-[14px] transition-[transform,background-color] hover:bg-white/25 active:scale-95">看图文版</Link>
          </div>
        </div>
      )}

      {/* The right-hand column. On a phone it lies over the video, so it keeps to three buttons low down, in
          the room the screens leave under their text (the mark and the download move to the wide layout and
          the chapters' sheet); on a wide screen it stands beside the video. */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-4 sm:bottom-32 sm:right-[max(0.75rem,calc(50%-100dvh*9/32-4.5rem))] sm:gap-5">
        <Link to="/" aria-label={`${SITE.name} 首页`} className="mb-1 hidden size-12 overflow-hidden rounded-full border-2 border-white bg-white transition-transform active:scale-90 sm:block">
          <img src="/icon-192.png" alt="" className="size-full object-cover" />
        </Link>
        {chapters.length > 0 && <Action label="目录" badge={chapters.length} onClick={() => setSheet(true)}><IconList size={22} /></Action>}
        <Action label="图文" to={v.page}><IconDoc size={22} /></Action>
        <Action label="分享" onClick={() => onShare(v)}><IconShare size={22} /></Action>
        <span className="hidden sm:block"><Action label="下载" href={v.video} download><IconDownload size={22} /></Action></span>
      </div>

      {/* What it is, bottom left; dims while the bar is dragged. */}
      <div className={`absolute bottom-9 left-4 right-24 transition-opacity duration-200 sm:left-[max(1rem,calc(50%-100dvh*9/32+1rem))] sm:right-[max(6rem,calc(50%-100dvh*9/32+5rem))] ${scrub !== null ? "opacity-0" : ""}`}>
        {current && (
          <button type="button" onClick={() => setSheet(true)} className="vp-in mb-2.5 flex max-w-full items-center gap-2 rounded-md bg-white/15 py-1 pl-2 pr-2.5 text-left text-[12.5px] backdrop-blur-md transition-colors hover:bg-white/25" key={chapter}>
            <Equalizer playing={!paused} />
            <span className="num shrink-0 font-semibold">{current.rank ?? "快讯"}{current.rank ? ` / ${chapters.filter((c) => c.rank).length}` : ""}</span>
            <span className="truncate">{current.title}</span>
          </button>
        )}
        <div className="text-[16px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">@{SITE.name}</div>
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="mt-1.5 block text-left">
          <span className={`text-[14.5px] leading-[1.5] [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] ${expanded ? "" : "line-clamp-2"}`}>{headline}</span>
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/75">
          <span>{v.period}</span>
          <span>第 {v.issueNumber} 期</span>
          <span className="num">{clock(v.durationSeconds)}</span>
          {extras && <span>{extras}</span>}
        </div>
        {expanded && (
          <Link to={v.page} className="vp-in mt-2.5 inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-[12px] backdrop-blur-md hover:bg-white/25">
            <IconDoc size={13} />看图文版和原文链接
          </Link>
        )}
      </div>

      {/* Dragging: the time and the entry under the finger. */}
      {scrub !== null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 text-center">
          <div className="num text-[30px] font-semibold tracking-wide [text-shadow:0_2px_8px_rgba(0,0,0,0.6)]">
            {clock(scrub * duration)} <span className="text-white/55">/ {clock(duration)}</span>
          </div>
          {scrubChapter && <div className="mx-auto mt-1 max-w-[80%] truncate text-[13px] text-white/80">{scrubChapter.rank ? `${scrubChapter.rank}. ` : ""}{scrubChapter.title}</div>}
        </div>
      )}

      {/* Progress: drag along it, or tap a point; a gap marks where each entry begins. */}
      <div
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round((scrub ?? 0) * duration)}
        tabIndex={-1}
        onPointerDown={scrubStart}
        onPointerMove={scrubMove}
        onPointerUp={scrubEnd}
        onPointerCancel={() => setScrub(null)}
        className="group absolute inset-x-0 bottom-0 flex h-6 cursor-pointer touch-none items-end sm:mx-auto sm:max-w-[calc(100dvh*9/16)]"
      >
        <div className={`relative w-full bg-white/20 transition-[height] duration-150 ${scrub !== null ? "h-[6px]" : "h-[3px] group-hover:h-[5px]"}`}>
          <div ref={fill} className="absolute inset-0 origin-left bg-white/90" style={{ transform: scrub !== null ? `scaleX(${scrub})` : undefined }} />
          {chapters.map((c) => c.at > 0 && (
            <span key={c.at} className="absolute inset-y-0 w-[2px] bg-black/50" style={{ left: `${(c.at / duration) * 100}%` }} />
          ))}
          {scrub !== null && <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${scrub * 100}%` }} />}
        </div>
      </div>

      {/* The chapters, from the bottom. */}
      <div
        aria-hidden={!sheet}
        onClick={() => setSheet(false)}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${sheet ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="本期目录"
        aria-hidden={!sheet}
        className={`absolute inset-x-0 bottom-0 max-h-[62dvh] overflow-hidden rounded-t-2xl bg-[#161a1c]/95 backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none sm:mx-auto sm:max-w-[calc(100dvh*9/16)] ${sheet ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <div className="text-[16px] font-semibold">本期目录</div>
            <div className="mt-0.5 text-[12px] text-white/55">{v.period} · {chapters.filter((c) => c.rank).length} 条要闻</div>
          </div>
          <div className="flex items-center gap-2">
            <a href={v.video} download tabIndex={sheet ? 0 : -1} className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-[12.5px] hover:bg-white/20">
              <IconDownload size={15} />下载
            </a>
            <button type="button" onClick={() => setSheet(false)} aria-label="收起目录" className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <IconChevronDown size={20} />
            </button>
          </div>
        </div>
        <ol className="max-h-[calc(62dvh-4.5rem)] overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {chapters.map((c, i) => {
            const on = i === chapter;
            return (
              <li key={c.at}>
                <button
                  type="button"
                  tabIndex={sheet ? 0 : -1}
                  onClick={() => jump(c.at)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${on ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <span className={`num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ${on ? "bg-[#2ce2e8] text-black" : "bg-white/10 text-white/70"}`}>
                    {on ? <Equalizer playing={!paused} /> : c.rank ?? "+"}
                  </span>
                  <span className={`flex-1 text-[14px] leading-[1.5] ${on ? "font-semibold text-white" : "text-white/85"}`}>{c.title}</span>
                  <span className="num mt-0.5 text-[12px] text-white/45">{clock(c.at)}</span>
                </button>
              </li>
            );
          })}
        </ol>
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
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const [hint, setHint] = useState(false);

  const slides = () => [...(feed.current?.querySelectorAll<HTMLElement>("[data-slide]") ?? [])];
  const go = (i: number) => slides()[i]?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  const tell = (text: string) => setToast((t) => ({ text, n: (t?.n ?? 0) + 1 }));
  const send = (what: string) => slides()[active]?.dispatchEvent(new CustomEvent("player", { detail: what }));
  const other = KINDS.find((k) => k !== current)!;
  const switchTo = (kind: VideoKind) => {
    setActive(0);
    setParams(kind === KINDS[0]!.kind ? {} : { kind }, { replace: true, preventScrollReset: true });
  };

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

  // A first visit is shown that there is more below, until the first swipe.
  useEffect(() => {
    let swiped = true;
    try {
      swiped = localStorage.getItem(HINT_KEY) === "1";
    } catch {
      // storage blocked: no hint
    }
    if (swiped || list.length < 2) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(t);
  }, [list.length]);
  useEffect(() => {
    if (active === 0) return;
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // storage blocked
    }
  }, [active]);

  // The keyboard: ↑ ↓ broadcasts, ← → chapters, space pauses, M sound, C chapters.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea")) return;
      const map: Record<string, () => void> = {
        ArrowDown: () => go(active + 1),
        ArrowUp: () => go(active - 1),
        ArrowRight: () => send("next"),
        ArrowLeft: () => send("prev"),
        " ": () => send("toggle"),
        m: () => (muted ? unmute() : setMuted(true)),
        c: () => send("chapters"),
      };
      const run = map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  const share = async (v: VideoEntry) => {
    const url = `${location.origin}/videos?${new URLSearchParams({ ...(v.kind === "weekly" ? { kind: "weekly" } : {}), v: v.key })}`;
    const text = `${v.headline ?? v.title} — ${SITE.name}${v.kind === "daily" ? "日报" : "周报"}视频播报`;
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch (error) {
        // Dismissed: nothing to do; not allowed here: copy instead.
        if ((error as Error).name === "AbortError") return;
      }
    }
    await copyText(url);
    tell("链接已复制");
  };

  const unmute = () => {
    setMuted(false);
    // The tap lets this video play with sound.
    const video = slides()[active]?.querySelector("video");
    if (video) {
      video.muted = false;
      video.play().catch(() => {});
    }
    tell("已开启声音");
  };

  return (
    <div className="fixed inset-0 select-none bg-black text-white">
      <style>{STYLES}</style>
      <h1 className="sr-only">{TITLE}</h1>
      <div ref={feed} key={current.kind} className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((v, i) => (
          <Slide
            key={v.key}
            v={v}
            active={i === active}
            near={i === active + 1}
            next={list[i + 1] ?? null}
            muted={muted}
            onNext={() => go(i + 1)}
            onShare={share}
            feed={{ label: current.label, when: current.when, count: list.length, other: other.label, onOther: () => switchTo(other.kind) }}
          />
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
        <Link to="/" aria-label="返回网站" className="pointer-events-auto flex size-10 items-center justify-center rounded-full transition-[transform,background-color] hover:bg-white/15 active:scale-90">
          <IconArrowLeft size={22} />
        </Link>
        {/* Over the video on a phone; on a wide screen beside the back button, clear of the video's story bar. */}
        <nav aria-label="视频类型" className="pointer-events-auto flex gap-6 sm:absolute sm:left-16 sm:top-1/2 sm:-translate-y-1/2 sm:pt-[env(safe-area-inset-top)]">
          {KINDS.map((k) => {
            const on = current.kind === k.kind;
            return (
              <button
                key={k.kind}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  if (on) return go(0);
                  switchTo(k.kind);
                }}
                className={`relative pb-1.5 text-[16.5px] transition-colors [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] ${on ? "font-semibold text-white" : "text-white/60 hover:text-white/85"}`}
              >
                {k.label}
                <span className={`absolute inset-x-1.5 bottom-0 h-[2.5px] rounded-full bg-white transition-transform duration-200 ${on ? "scale-x-100" : "scale-x-0"}`} />
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => (muted ? unmute() : setMuted(true))}
          aria-label={muted ? "打开声音" : "关闭声音"}
          className={`pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-[transform,background-color] active:scale-95 ${muted ? "vp-glow bg-white/20 backdrop-blur-md" : "hover:bg-white/15"}`}
        >
          <IconSound on={!muted} />
          {muted && "开声音"}
        </button>
      </div>

      {hint && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-[38%] flex flex-col items-center text-white">
          <span className="vp-hint flex flex-col items-center">
            <IconChevronDown size={30} className="rotate-180" />
            <IconChevronDown size={30} className="-mt-4 rotate-180 opacity-60" />
          </span>
          <span className="mt-1 rounded-full bg-black/45 px-3 py-1 text-[13px] backdrop-blur-md">上滑看下一期</span>
        </div>
      )}

      {toast && (
        <div key={toast.n} role="status" className="vp-in absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/75 px-4 py-2.5 text-[14px]">{toast.text}</div>
      )}
    </div>
  );
}

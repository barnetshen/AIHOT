import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { EDITION_WHEN, SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { AsideCard, EmptyState, ReadingLayout } from "@aihot/web/components/ui/Page";
import { IconDownload, IconDoc } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { VideoEntry, VideosResponse } from "../types.ts";

export const handle: Screen = { tab: "daily", name: "视频" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(60, await apiGet<VideosResponse>("/api/videos", { signal: request.signal }));
}

export function meta() {
  return pageMeta({
    title: subjectVideos(),
    description: `${SITE.name} 的视频版：每条精选、每期日报和周报各一条竖屏短视频，新闻自带视频的直接播放，没有的用文字讲清楚，都可回到图文版看原文链接。`,
    path: "/videos",
  });
}

function subjectVideos() {
  return `${withSubject("新闻")}视频`;
}

type Tab = keyof VideosResponse;

const TABS: Array<{ key: Tab; label: string; empty: string }> = [
  { key: "items", label: "每条", empty: "精选的新闻会在几分钟内各有一条视频。" },
  { key: "daily", label: "日报", empty: `日报${EDITION_WHEN.daily}出刊后，视频会在几分钟内出现在这里。` },
  { key: "weekly", label: "周报", empty: `周报${EDITION_WHEN.weekly}出刊后，视频会在几分钟内出现在这里。` },
];

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** One video of the feed, filling the feed's height. It plays while most of it is in view. */
function Slide({ v, onEnded }: { v: VideoEntry; onEnded: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const seen = new IntersectionObserver(([e]) => {
      const visible = !!e && e.intersectionRatio >= 0.6;
      setNear((n) => n || (!!e && e.intersectionRatio > 0));
      // Browsers let a muted video start by itself; one the reader unmuted may still be refused.
      if (visible) video.play().catch(() => {});
      else video.pause();
    }, { threshold: [0, 0.6] });
    seen.observe(video);
    return () => seen.disconnect();
  }, []);
  // The video shows its own headline; the bar under it says when, how long, and where to read more.
  const title = v.kind === "item" ? v.title : v.headline ?? v.title;
  return (
    <section data-slide="" className="flex h-full snap-start snap-always flex-col bg-black">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={ref}
          muted
          playsInline
          controls
          preload={near ? "auto" : "none"}
          poster={v.poster}
          src={v.video}
          onEnded={onEnded}
          aria-label={title}
          className="h-full max-h-full w-auto max-w-full object-contain"
        />
      </div>
      <div className="flex shrink-0 items-center gap-4 px-4 py-2.5 text-[12px] text-white/70">
        <span className="min-w-0 flex-1 truncate">
          {v.period}
          {v.issueNumber !== null && ` · 第 ${v.issueNumber} 期`} · <span className="num">{minutes(v.durationSeconds)}</span>
          {v.clips > 0 && " · 含原视频"}
        </span>
        <Link viewTransition to={v.page} className="inline-flex shrink-0 items-center gap-1 font-medium text-white hover:underline">
          <IconDoc size={14} />图文版
        </Link>
        <a href={v.video} download className="inline-flex shrink-0 items-center gap-1 hover:text-white">
          <IconDownload size={14} />下载
        </a>
      </div>
    </section>
  );
}

/** The videos of a tab, newest first, one screen each: scroll or swipe to the next; one that ends moves on. */
function Feed({ videos }: { videos: VideoEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const next = (i: number) => {
    const slides = ref.current?.querySelectorAll<HTMLElement>("[data-slide]");
    slides?.[i + 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div ref={ref} className="mx-auto h-[calc(100dvh-11rem)] min-h-[420px] max-w-[540px] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-card bg-black lg:h-[calc(100dvh-8rem)]">
      {videos.map((v, i) => <Slide key={`${v.kind}-${v.key}`} v={v} onEnded={() => next(i)} />)}
    </div>
  );
}

export default function VideosPage() {
  const videos = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab")) ?? TABS[0]!;
  const list = videos[tab.key];

  const aside = (
    <AsideCard title="关于视频版">
      <p className="text-[13px] leading-[1.75] text-ink-3">
        每条精选、每期{withSubject("日报")}和周报，各自动生成一条竖屏短视频（1080×1920）。新闻自带视频、来源允许全文展示的，直接播放原视频；没有的，用标题、摘要和来源讲清楚。内容有更正或撤回时会重新生成。
      </p>
    </AsideCard>
  );

  return (
    <ReadingLayout aside={aside}>
      <header className="flex items-end justify-between gap-4 pb-4">
        <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">{subjectVideos()}</h1>
        <div role="tablist" aria-label="视频类型" className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab.key === t.key}
              onClick={() => setParams(t.key === TABS[0]!.key ? {} : { tab: t.key }, { replace: true, preventScrollReset: true })}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${tab.key === t.key ? "bg-ink font-medium text-bg" : "bg-bg-sunk text-ink-2 hover:text-ink"}`}
            >
              {t.label}
              <span className="num ml-1 text-[11.5px] opacity-70">{videos[t.key].length}</span>
            </button>
          ))}
        </div>
      </header>
      {list.length ? (
        <Feed key={tab.key} videos={list} />
      ) : (
        <div className="card">
          <EmptyState title={`还没有${tab.label}视频`}>{tab.empty}</EmptyState>
        </div>
      )}
    </ReadingLayout>
  );
}

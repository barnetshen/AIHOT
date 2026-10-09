import { Link, useLoaderData, useSearchParams } from "react-router";
import { EDITION_WHEN, SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { AsideCard, EmptyState, ReadingLayout } from "@aihot/web/components/ui/Page";
import { IconDownload, IconDoc } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { VideoEntry, VideoKind, VideosResponse } from "../types.ts";

export const handle: Screen = { tab: "daily", name: "视频播报" };
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

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function VideoCard({ v, large = false }: { v: VideoEntry; large?: boolean }) {
  return (
    <figure className={large ? "card overflow-hidden sm:flex" : "card overflow-hidden"}>
      <video
        controls
        playsInline
        preload={large ? "metadata" : "none"}
        poster={v.poster}
        src={v.video}
        aria-label={v.headline ?? v.title}
        className={`aspect-[9/16] w-full bg-black object-contain ${large ? "sm:w-[300px] sm:shrink-0" : ""}`}
      />
      <figcaption className={large ? "flex flex-col p-5 sm:p-6" : "p-3.5"}>
        <div className="text-[12px] text-ink-4">
          {v.period} · 第 {v.issueNumber} 期 · <span className="num">{minutes(v.durationSeconds)}</span>
        </div>
        {v.headline && <p className={`mt-1.5 font-semibold text-ink ${large ? "text-[18px] leading-[1.5]" : "line-clamp-2 text-[13.5px] leading-[1.5]"}`}>{v.headline}</p>}
        {large && (v.clips > 0 || v.pictures > 0) && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            {[v.clips > 0 && `${v.clips} 条配原视频`, v.pictures > 0 && `${v.pictures} 条配新闻图片`].filter(Boolean).join("，")}
          </p>
        )}
        <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] ${large ? "mt-auto pt-5" : "mt-2"}`}>
          <Link viewTransition to={v.page} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
            <IconDoc size={14} />图文版
          </Link>
          <a href={v.video} download className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
            <IconDownload size={14} />下载
          </a>
        </div>
      </figcaption>
    </figure>
  );
}

export default function VideosPage() {
  const videos = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const current = KINDS.find((k) => k.kind === params.get("kind")) ?? KINDS[0]!;
  const [latest, ...earlier] = videos[current.kind];

  const aside = (
    <AsideCard title="关于视频播报">
      <p className="text-[13px] leading-[1.75] text-ink-3">
        每期{withSubject("日报")}和周报出刊后，几分钟内自动生成一条竖屏视频播报：主播逐条口播要闻，画面配新闻自带的视频或图片（仅限允许全文展示的来源），没有的用文字。内容有更正或撤回时会重新生成。
      </p>
    </AsideCard>
  );

  return (
    <ReadingLayout aside={aside}>
      <header className="pb-5">
        <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">{TITLE}</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">几分钟，听完当天和本周的要闻。</p>
      </header>
      <div role="tablist" aria-label="视频类型" className="mb-5 flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={current.kind === k.kind}
            onClick={() => setParams(k.kind === KINDS[0]!.kind ? {} : { kind: k.kind }, { replace: true, preventScrollReset: true })}
            className={`rounded-full px-4 py-1.5 text-[13px] transition-colors ${current.kind === k.kind ? "bg-ink font-medium text-bg" : "bg-bg-sunk text-ink-2 hover:text-ink"}`}
          >
            {k.label}
            <span className="num ml-1.5 text-[11.5px] opacity-70">{videos[k.kind].length}</span>
          </button>
        ))}
      </div>
      {latest ? (
        <div className="space-y-6">
          <VideoCard key={latest.key} v={latest} large />
          {earlier.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold text-ink-3">往期</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {earlier.map((v) => <VideoCard key={v.key} v={v} />)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="card">
          <EmptyState title={`还没有${current.label}视频播报`}>{current.label}{current.when}出刊后，视频会在几分钟内出现在这里。</EmptyState>
        </div>
      )}
    </ReadingLayout>
  );
}

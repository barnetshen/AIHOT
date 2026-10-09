import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, itemListLd, listPath, pageMeta, readFilters, siteLd } from "../lib/seo";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { ActiveFilters, CategoryTabs, FeedBar, SearchField } from "../features/feed/Filters";
import { IconDoc, IconPlug, IconRss, IconSparkles } from "../components/icons";
import { loadParts } from "../site-modules";
import { EDITION_WHEN, withSubject } from "@aihot/site";

export const handle: Screen = { tab: "featured", name: "精选" };
const PARTS = await loadParts((m) => m.home);
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  const data = await loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal: request.signal });
  return cachedPage(60, { data, filters }, upstream);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map((c) => c.item.title) ?? [];
  return pageMeta({ path, jsonLd: path === "/" ? [...siteLd(), itemListLd("/", "精选", titles)] : undefined });
}

/** Ways on from the side column: the reports and the ways to take the feed elsewhere. */
const ONWARD = [
  { to: "/daily", label: withSubject("日报"), note: EDITION_WHEN.daily, icon: IconDoc },
  { to: "/weekly", label: withSubject("周报"), note: EDITION_WHEN.weekly, icon: IconSparkles },
  { to: "/agent?tab=rss", label: "RSS 订阅", note: "用阅读器订阅", icon: IconRss },
  { to: "/agent", label: "Agent 接入", note: "MCP · API", icon: IconPlug },
];

export default function Home() {
  const { data, filters } = useLoaderData<typeof loader>();
  const title = filters.tag ? `#${filters.tag}` : "精选";
  // The modules' parts belong to the plain home page, not to a filtered one.
  const plain = !filters.category && filters.channel === "all" && !filters.tag;
  return (
    <div className="pb-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-10">
      <div className="min-w-0">
        {/* Phones: the bar (精选 | 全部, filter, search), the filter in use, the modules' parts, today's hot topics, the feed. */}
        <FeedBar base="/" category={filters.category} channel={filters.channel} />
        <ActiveFilters base="/" category={filters.category} channel={filters.channel} tag={filters.tag} />
        <div className="hidden lg:block">
          <h1 className="text-[28px] font-bold leading-[1.25] tracking-[-0.02em] text-ink">{title}</h1>
          <div className="mb-6 mt-4 flex items-center justify-between gap-4">
            <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
            <SearchField keep={{ category: filters.category }} />
          </div>
        </div>

        {plain && PARTS.map(({ name, part: { Top } }) => Top && <div key={name} className="xl:hidden"><Top /></div>)}
        {data.hot && <div className="xl:hidden"><HotTopics entries={data.hot} /></div>}

        <Timeline initial={data} filters={data.filters} />
      </div>

      {/* Wide desktops: a side column that stays in view beside the feed. */}
      <aside aria-label="侧栏" className="hidden xl:block">
        <div className="scrollbar-none sticky top-6 max-h-[calc(100dvh-3rem)] space-y-7 overflow-y-auto pb-2">
          {PARTS.map(({ name, part: { Rail } }) => Rail && <Rail key={name} />)}
          {data.hot && <HotTopics entries={data.hot} compact />}
          <nav aria-label="更多入口" className="grid grid-cols-2 gap-2.5">
            {ONWARD.map((o) => (
              <Link key={o.to} to={o.to} prefetch="intent" className="card card-hover group flex flex-col gap-2 p-3.5">
                <span className="flex size-8 items-center justify-center rounded-control bg-accent-soft text-accent transition-transform duration-200 group-hover:scale-110">
                  <o.icon size={17} />
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-ink">{o.label}</span>
                  <span className="block text-[11.5px] text-ink-4">{o.note}</span>
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}

import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, itemListLd, listPath, pageMeta, readFilters, siteLd } from "../lib/seo";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { ActiveFilters, CategoryTabs, FeedBar, SearchField } from "../features/feed/Filters";
import { loadParts } from "../site-modules";

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
  // The modules' parts belong to the plain home page, not to a filtered one; one that cannot be read is
  // left out rather than failing the page.
  const plain = !filters.category && filters.channel === "all" && !filters.tag;
  const [data, ...partData] = await Promise.all([
    loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal: request.signal }),
    ...PARTS.map(({ part }) => (plain ? apiGet<unknown>(part.api, { signal: request.signal }).catch(() => null) : null)),
  ]);
  return cachedPage(60, { data, filters, plain, parts: partData }, upstream);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map((c) => c.item.title) ?? [];
  return pageMeta({ path, jsonLd: path === "/" ? [...siteLd(), itemListLd("/", "精选", titles)] : undefined });
}

export default function Home() {
  const { data, filters, plain, parts } = useLoaderData<typeof loader>();
  const title = filters.tag ? `#${filters.tag}` : "精选";
  return (
    <div className="pb-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-10">
      <div className="min-w-0">
        {/* Phones: the bar (精选 | 全部, filter, search), the filter in use, the modules' parts, today's hot topics, the feed. */}
        <FeedBar base="/" category={filters.category} channel={filters.channel} />
        <ActiveFilters base="/" category={filters.category} channel={filters.channel} tag={filters.tag} />
        <div className="hidden lg:block">
          <h1 className="text-28 font-bold leading-[1.25] tracking-[-0.02em] text-ink">{title}</h1>
          <div className="mb-6 mt-4 flex items-center justify-between gap-4">
            <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
            <SearchField keep={{ category: filters.category }} />
          </div>
        </div>

        {plain && PARTS.map(({ name, part: { Top } }, i) => Top && <div key={name} className="xl:hidden"><Top data={parts[i]} /></div>)}
        {data.hot && <div className="xl:hidden"><HotTopics entries={data.hot} /></div>}

        <Timeline initial={data} filters={data.filters} />
      </div>

      {/* Wide desktops: a side column that stays in view beside the feed. */}
      <aside aria-label="侧栏" className="hidden xl:block">
        <div className="scrollbar-none sticky top-6 max-h-[calc(100dvh-3rem)] space-y-7 overflow-y-auto pb-2">
          {plain && PARTS.map(({ name, part: { Rail } }, i) => Rail && <Rail key={name} data={parts[i]} />)}
          {data.hot && <HotTopics entries={data.hot} compact />}
        </div>
      </aside>
    </div>
  );
}

import { useLoaderData } from "react-router";
import { IntentLink } from "../components/ui/IntentLink";
import type { ReportIndexEntry, ReportIndexResponse } from "@aihot/contracts/site";
import { SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { archiveLd, pageMeta } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { weekdayShort } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { archiveGroups, ENTRIES_UNIT } from "../features/report/format";
import { SectionPage } from "../features/report/ReportPaper";
import { IconChevronRight } from "../components/icons";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "往期" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const { items: index } = await apiGet<ReportIndexResponse>("/api/site/reports/daily", { signal: request.signal });
  return cachedPage(600, { index, today: beijingDate(Date.now()) });
}

export function meta({ loaderData }: { loaderData?: { index: ReportIndexEntry[] } }) {
  const entries = (loaderData?.index ?? []).map((e: ReportIndexEntry) => ({ path: `/daily/${e.key}`, name: e.title ? `${e.key} · ${e.title}` : `${SITE.name} 日报 · ${e.key}` }));
  return pageMeta({ title: `${withSubject("日报")} · 历史存档`, description: `${SITE.name} 历史日报，按日期归档。`, path: "/daily/archive", image: "/og/pages/daily.png", jsonLd: archiveLd("/daily/archive", `${SITE.name} 日报 · 历史存档`, entries) });
}

export default function DailyArchive() {
  const { index, today } = useLoaderData<typeof loader>();
  const months = archiveGroups("daily", index);
  return (
    <ReportLayout kind="daily" index={index} current={null} today={today} back={{ to: "/daily", label: "日报" }} title="日报合订本">
      <header data-masthead="" className="pt-1 lg:pt-0">
        <p className="text-14 font-semibold text-ink-4">
          {withSubject("日报")} · 共 <span className="num">{index[0]?.issueNumber ?? 0}</span> 期
        </p>
        <h1 id="report-start" data-page-title="" className="mt-0.5 text-32 font-bold leading-[1.2] tracking-[-0.025em] text-ink lg:text-40">
          日报合订本
        </h1>
      </header>
      {months.map((m) => (
        <SectionPage key={m.id} id={`m-${m.id}`} label={m.label} note={`${m.entries.length} 期`}>
          <ol className="card overflow-hidden">
            {m.entries.map((e) => (
              <li key={e.key} className="group/row relative">
                <span aria-hidden="true" className="absolute left-[72px] right-0 top-0 h-px bg-line-soft group-first/row:hidden lg:left-[76px]" />
                <IntentLink viewTransition to={`/daily/${e.key}`} className="group flex items-center gap-4 px-5 py-3.5 transition-colors active:bg-bg-sunk lg:px-6 lg:hover:bg-surface-2">
                  <span className="flex w-8 shrink-0 flex-col items-center">
                    <span className="num text-20 font-semibold leading-none text-ink">{e.key.slice(8, 10)}</span>
                    <span className="mt-1 text-11 leading-none text-ink-4">{weekdayShort(e.key)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-15 font-semibold leading-[1.5] text-ink transition-colors group-hover:text-accent">{e.title ?? `${withSubject("日报")} ${e.key}`}</span>
                    {!!e.count && (
                      <span className="mt-0.5 block text-13 text-ink-4">
                        <span className="num">{e.count}</span>{` ${ENTRIES_UNIT}`}
                      </span>
                    )}
                  </span>
                  <IconChevronRight size={15} className="shrink-0 text-ink-4" />
                </IntentLink>
              </li>
            ))}
          </ol>
        </SectionPage>
      ))}
    </ReportLayout>
  );
}

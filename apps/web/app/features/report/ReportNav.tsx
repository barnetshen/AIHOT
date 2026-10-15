// Moving between reports: the archive column on desktop; on phones the kind switch in the bar
// (ReportLayout) and recent-issue chips under it.
import { IntentLink } from "../../components/ui/IntentLink";
import { useEffect, useState } from "react";
import type { ReportNavigationEntry, ReportNavigationResponse, ReportKind } from "@aihot/contracts/site";
import { PillTabs } from "../../components/ui/Tabs";
import { IconChevronRight } from "../../components/icons";
import { KINDS, KIND_LABEL, KIND_PATH, archiveGroups, archiveMark, chipLabel, reportPath } from "./format";

/** 日报 / 周报 / 月报 as the site's pill switch: spread across the archive column, or compact in the phone bar (opening at the top). */
export function KindSwitch({ kind, phone = false }: { kind: ReportKind; phone?: boolean }) {
  return (
    <PillTabs
      fill={!phone}
      size={phone ? "sm" : "md"}
      layoutId={phone ? "report-kind-phone" : "report-kind"}
      label="切换日报、周报、月报"
      active={kind}
      items={KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], to: KIND_PATH[k], resetScroll: phone, prefetch: 'intent' }))}
    />
  );
}

/** Desktop archive column: every issue of this kind, grouped, the current one highlighted. */
export function ReportArchive({ kind, index, current }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null }) {
  const groups = archiveGroups(kind, index);
  const openId = groups.find((g) => g.entries.some((e) => e.key === current))?.id ?? groups[0]?.id;
  return (
    <aside className="sticky top-0 hidden h-dvh w-[280px] shrink-0 flex-col border-r border-line-soft bg-sidebar pl-5 pr-3 lg:flex">
      <div className="pb-5 pt-8">
        <KindSwitch kind={kind} />
      </div>
      {groups.length > 0 && <div className="pb-1 pl-1 text-13 font-semibold text-ink-4">往期</div>}
      <nav aria-label={`${KIND_LABEL[kind]}历史`} className="scrollbar-thin -mr-3 flex-1 overflow-y-auto pb-6 pr-3">
        {groups.map((g) => (
          <ArchiveGroup key={g.id} g={g} kind={kind} current={current} initiallyOpen={g.id === openId} />
        ))}
      </nav>
      {kind === "daily" && (
        <IntentLink to="/daily/archive" className="flex h-12 shrink-0 items-center justify-between border-t border-line-soft pl-1 pr-1.5 text-14 text-accent transition-opacity hover:opacity-70">
          日报合订本 <IconChevronRight size={14} />
        </IntentLink>
      )}
    </aside>
  );
}

/** Closed daily months keep only keys; titles load when opened, and the full archive is SSR. */
function ArchiveGroup({ g, kind, current, initiallyOpen }: {
  g: ReturnType<typeof archiveGroups>[number]; kind: ReportKind; current: string | null; initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => setOpen(initiallyOpen), [initiallyOpen]);
  const [loaded, setLoaded] = useState<ReportNavigationEntry[] | null>(null);
  useEffect(() => {
    if (!open || loaded || kind !== "daily" || !g.entries.some((e) => e.title === undefined)) return;
    const controller = new AbortController();
    fetch(`/api/site/reports/daily/months/${g.id}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data: ReportNavigationResponse | null) => { if (data && !controller.signal.aborted) setLoaded(data.items); })
      .catch(() => {});
    return () => controller.abort();
  }, [open, kind, g.id, loaded]);
  const entries = loaded ?? g.entries;
  const mark = (key: string) => archiveMark(kind, key);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="disclosure group/month">
      <summary className="flex h-10 items-center gap-1.5 pl-1 pr-1.5 text-14 text-ink transition-colors hover:text-accent">
        <IconChevronRight size={14} className="text-ink-4 transition-transform duration-200 group-open/month:rotate-90" />
        <span className="flex-1 font-semibold">{g.label}</span>
        <span className="num text-12 text-ink-4">{g.entries.length}</span>
      </summary>
      {(kind !== "daily" || open) && <ul className="space-y-0.5 pb-2">
        {entries.map((e) => {
          const on = e.key === current;
          return (
            <li key={e.key}>
              <IntentLink
                to={reportPath(kind, e.key)}
                aria-current={on ? "page" : undefined}
                title={e.title ?? undefined}

                className={`group flex gap-3 rounded-control py-2 pl-2 pr-2 transition-colors ${on ? "bg-bg-muted" : "hover:bg-bg-muted/60"}`}
              >
                <span className="flex w-8 shrink-0 flex-col items-center">
                  <span className={`num text-17 font-semibold leading-none ${on ? "text-accent" : "text-ink"}`}>{mark(e.key).big}</span>
                  {mark(e.key).small && <span className="mt-1 whitespace-nowrap text-11 leading-none text-ink-4">{mark(e.key).small}</span>}
                </span>
                <span className={`line-clamp-2 min-w-0 text-13 leading-[18px] transition-colors ${on ? "font-semibold text-ink" : "text-ink-3 group-hover:text-ink"}`}>{e.title ?? `${KIND_LABEL[kind]} ${e.key}`}</span>
              </IntentLink>
            </li>
          );
        })}
      </ul>}
      {kind === "daily" && !open && <noscript><a href="/daily/archive">查看完整日报归档</a></noscript>}
    </details>
  );
}

/** Phones, under the bar: the three latest issues and a way further back, once there is more than one. */
export function ReportPhoneNav({ kind, index, current, today }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null; today: string }) {
  const recent = index.slice(0, 3);
  const earlier = kind === "daily" ? "/daily/archive" : "#report-history";
  const chip = "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-14 transition-[background-color,transform] active:scale-95";
  if (index.length < 2) return null;
  return (
    <nav aria-label={`最近的${KIND_LABEL[kind]}`} className="scrollbar-none bleed flex gap-2 overflow-x-auto pb-3 pt-1 lg:hidden">
      {recent.map((e) => {
        const on = e.key === current;
        return (
          <IntentLink key={e.key} to={reportPath(kind, e.key)} aria-current={on ? "page" : undefined} className={`${chip} ${on ? "bg-ink font-semibold text-bg" : "bg-field text-ink-2"}`}>
            {chipLabel(kind, e.key, index, today)}
          </IntentLink>
        );
      })}
      {index.length > 3 && (
        <IntentLink to={earlier} viewTransition={kind === "daily"} className={`${chip} bg-field text-ink-2`}>
          更早
        </IntentLink>
      )}
    </nav>
  );
}

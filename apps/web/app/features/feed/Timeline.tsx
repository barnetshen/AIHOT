// The day-grouped feed (精选 home, topics): a time rail with cards on desktop, rows under grey day bars on
// phones. Keeps its place across back navigation and loads further pages. There is no "new items"
// prompt: readers refresh for the latest head — on phones also by tapping the tab again.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { Collapse } from "../../components/ui/Presence";
import type { TimelineCard, TimelineFilters, TimelineResponse } from "@aihot/contracts/site";
import { FeedItem } from "./FeedItem";
import { IconChevronDown } from "../../components/icons";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { EmptyState } from "../../components/ui/Page";
import { beijingDate, beijingWeekday } from "@aihot/contracts/time";
import { monthDay, weekdayShort } from "../../lib/format";
import { isHydrated } from "../../lib/hydration";
import { markRead, useReadSet } from "../../lib/local-state";
import { filterParams, listPath } from "../../lib/seo";
import { isReload, readSnapshot, restoreAnchor, saveSnapshot, useSaveOnLeave } from "../../lib/restore";

const AUTO_BATCHES = 3;

interface ListState {
  version: 2;
  cards: TimelineCard[];
  nextCursor: string | null;
  dayCounts: Record<string, number>;
  collapsed: string[];
  batches: number;
}

function fromResponse(r: TimelineResponse): ListState {
  return { version: 2, cards: r.cards, nextCursor: r.nextCursor, dayCounts: r.dayCounts, collapsed: [], batches: 1 };
}

/**
 * A day's section header, as an Apple list sets one: the day in bold ("今天" for today), the weekday and the
 * count in grey. It stays under the phone bar while its day scrolls by; on the timeline it folds the day.
 */
export function DayHeader({ day, today, count, collapsed, onToggle, aside }: { day: string; today: string; count: number | null; collapsed?: boolean; onToggle?: () => void; aside?: React.ReactNode }) {
  const date = monthDay(day);
  const isToday = day === today;
  const row = (
    <>
      <span className="text-20 font-bold tracking-[-0.015em] text-ink">{isToday ? "今天" : date}</span>
      <span className="text-14 text-ink-4">{isToday ? `${date} ${weekdayShort(day)}` : beijingWeekday(day)}</span>
      <span className="ml-auto flex items-center gap-1.5 text-13 text-ink-4">
        {aside}
        {count !== null && (
          <span>
            <span className="num">{count}</span> 条
          </span>
        )}
        {onToggle && <IconChevronDown size={15} className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />}
      </span>
    </>
  );
  return (
    <div className="bleed sticky top-[var(--bar-h)] z-20 bg-bg/90 backdrop-blur-xl lg:static lg:mx-0 lg:px-0 lg:backdrop-blur-none">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? "展开" : "收起"}${date}`} className="flex h-12 w-full items-baseline gap-2 pt-3 text-left lg:h-14 lg:pt-5">
          {row}
        </button>
      ) : (
        <div className="flex h-12 items-baseline gap-2 pt-3 lg:h-14 lg:pt-5">{row}</div>
      )}
    </div>
  );
}

/** One row of a day's grouped list, with a hairline above it inset to the text (none above the first). */
export function TimelineSlot({ children, fresh = false, delay = 0, dataKey }: { children: React.ReactNode; fresh?: boolean; delay?: number; dataKey?: string }) {
  return (
    <li
      data-card-key={dataKey}
      className={`group/slot relative px-4 py-3.5 transition-colors duration-150 touch:has-[a:active]:bg-bg-sunk lg:px-5 lg:py-4 lg:hover:bg-surface-2 ${fresh ? "animate-fade-up" : ""}`}
      style={fresh ? { animationDelay: `${delay}ms` } : undefined}
    >
      <span aria-hidden="true" className="absolute right-0 top-0 left-4 h-px bg-line-soft group-first/slot:hidden lg:left-5" />
      {children}
    </li>
  );
}

/** The day's lead (its strongest pick) set apart above the list, then the rest in time order. */
function splitLead(cards: TimelineCard[]): [TimelineCard | null, TimelineCard[]] {
  if (cards.length < 3) return [null, cards];
  const lead = cards.reduce((a, c) => ((c.item.score ?? 0) > (a.item.score ?? 0) ? c : a));
  return [lead, cards.filter((c) => c !== lead)];
}

/** `interlude` comes after the first day, so the news leads and what browses alongside it follows. */
export function Timeline({ initial, filters, interlude }: { initial: TimelineResponse; filters: TimelineFilters; interlude?: React.ReactNode }) {
  const location = useLocation();
  const navigation = useNavigation();
  const readSet = useReadSet();
  const historyKey = location.key;

  // Back navigation (client side): restore synchronously from the snapshot. A full reload restores
  // after hydration so the first client render matches the server HTML.
  const [state, setState] = useState<ListState>(() => {
    if (isHydrated()) {
      const snap = readSnapshot<ListState>(historyKey);
      if (snap?.data.version === 2 && snap.data.cards.length > 0) return snap.data;
    }
    return fromResponse(initial);
  });
  const restoredRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Filters (i.e. the loader data) changed. A page still loading for the old filters is cancelled, and a
  // response that arrives anyway is dropped (it belongs to another list and cursor). Back or forward to a
  // filter already visited restores what that history entry had loaded and folded; a new one starts over.
  const filterKey = listPath("/api/site/timeline", filterParams(filters));
  const lastFilterKey = useRef(filterKey);
  const pageRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pageRequest.current?.abort(), []);
  useLayoutEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      pageRequest.current?.abort();
      pageRequest.current = null;
      setLoadingMore(false);
      setLoadError(false);
      const snap = readSnapshot<ListState>(historyKey);
      if (snap?.data.version === 2 && snap.data.cards.length > 0) {
        setState(snap.data);
        restoreAnchor(snap.anchor, snap.scrollY);
      } else {
        setState(fromResponse(initial));
      }
    }
  }, [filterKey, initial, historyKey]);

  // The same list with new data (the tab tapped again at the top, or the brand tapped): start over from
  // the fresh head. A change of filters is handled above.
  const lastData = useRef({ initial, filterKey });
  useLayoutEffect(() => {
    const prev = lastData.current;
    lastData.current = { initial, filterKey };
    if (prev.initial === initial || prev.filterKey !== filterKey) return;
    pageRequest.current?.abort();
    pageRequest.current = null;
    setLoadingMore(false);
    setLoadError(false);
    setState(fromResponse(initial));
  }, [initial, filterKey]);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readSnapshot<ListState>(historyKey);
    if (!isHydrated()) {
      // A full load keeps the server's fresh list when the reader reloaded; after a back/forward
      // that reloaded the document, it restores the saved list and position.
      if (snap?.data.version === 2 && snap.data.cards.length > 0 && !isReload()) {
        setState(snap.data);
        requestAnimationFrame(() => restoreAnchor(snap.anchor, snap.scrollY));
      }
      return;
    }
    if (snap?.data.version === 2 && snap.data.cards.length > 0) restoreAnchor(snap.anchor, snap.scrollY);
  }, [historyKey]);

  // Save the snapshot whenever we leave this history entry.
  useEffect(() => {
    if (navigation.state === "loading" && navigation.location && navigation.location.key !== historyKey) {
      saveSnapshot(historyKey, stateRef.current);
    }
  }, [navigation.state, navigation.location, historyKey]);
  useSaveOnLeave(historyKey, () => stateRef.current);

  const loadMore = useCallback(async () => {
    const s = stateRef.current;
    if (!s.nextCursor || pageRequest.current) return;
    const key = listPath("/api/site/timeline", filterParams(filters));
    const controller = new AbortController();
    pageRequest.current = controller;
    const current = () => lastFilterKey.current === key && !controller.signal.aborted;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const res = await fetch(listPath("/api/site/timeline", { ...filterParams(filters), cursor: s.nextCursor }), { signal: controller.signal });
      if (res.status === 400) {
        // Cursor no longer fits: start over from the head.
        const head = await fetch(key, { signal: controller.signal });
        if (!head.ok) throw new Error(String(head.status));
        if (current()) setState(fromResponse((await head.json()) as TimelineResponse));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as TimelineResponse;
      if (!current()) return;
      setState((prev) => {
        const seen = new Set(prev.cards.map((c) => c.key));
        const added = page.cards.filter((c) => !seen.has(c.key));
        setFreshKeys(new Set(added.map((c) => c.key)));
        return {
          ...prev,
          cards: [...prev.cards, ...added],
          nextCursor: page.nextCursor,
          dayCounts: { ...prev.dayCounts, ...page.dayCounts },
          batches: prev.batches + 1,
        };
      });
    } catch {
      if (current()) setLoadError(true);
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        setLoadingMore(false);
      }
    }
  }, [filters]);

  // Auto-load a few batches when the sentinel nears the viewport, then hand over to a button.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !state.nextCursor || state.batches >= AUTO_BATCHES) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [state.nextCursor, state.batches, loadMore]);

  const today = beijingDate(Date.now());
  const days = useMemo(() => {
    const out: Array<{ day: string; cards: TimelineCard[] }> = [];
    for (const c of state.cards) {
      const d = beijingDate(c.anchorAt);
      const last = out[out.length - 1];
      if (last && last.day === d) last.cards.push(c);
      else out.push({ day: d, cards: [c] });
    }
    return out;
  }, [state.cards]);

  const toggleDay = (day: string) =>
    setState((s) => ({ ...s, collapsed: s.collapsed.includes(day) ? s.collapsed.filter((d) => d !== day) : [...s.collapsed, day] }));

  let order = 0;
  return (
    <div className="relative">
      {days.length === 0 && (
        <div className="card">
          <EmptyState title="这个筛选下还没有精选内容">换个类别看看，或者去全部动态里找找。</EmptyState>
        </div>
      )}

      {days.map(({ day, cards }, dayIndex) => {
        const collapsed = state.collapsed.includes(day);
        const count = state.dayCounts[day] ?? cards.length;
        return (
          <section key={day} aria-label={day} className="pb-2">
            <DayHeader day={day} today={today} count={count} collapsed={collapsed} onToggle={() => toggleDay(day)} />
            <Collapse open={!collapsed}>
              {(() => {
                const [lead, rest] = splitLead(cards);
                const item = (c: TimelineCard, hero = false) => (
                  <FeedItem item={c.item} group={c.group} filters={filters} read={readSet.has(c.item.id)} onOpen={markRead} at={c.anchorAt} inPicks hero={hero} />
                );
                return (
                  <div className="pt-1">
                    {lead && (
                      <div data-card-key={lead.key} className="group/slot card relative mb-3 px-5 py-5 transition-shadow duration-200 lg:px-7 lg:py-6 lg:hover:shadow-[var(--shadow-card-hover)]">
                        {item(lead, true)}
                      </div>
                    )}
                    <ol className="card overflow-hidden">
                      {rest.map((c) => {
                        const fresh = freshKeys.has(c.key);
                        const delay = fresh ? Math.min(order++, 10) * 40 : 0;
                        return (
                          <TimelineSlot key={c.key} dataKey={c.key} fresh={fresh} delay={delay}>
                            {item(c)}
                          </TimelineSlot>
                        );
                      })}
                    </ol>
                  </div>
                );
              })()}
            </Collapse>
            {dayIndex === 0 && interlude}
          </section>
        );
      })}

      <div ref={sentinel} aria-hidden="true" />
      <FeedEnd loading={loadingMore} error={loadError} hasMore={!!state.nextCursor} manual={state.batches >= AUTO_BATCHES} empty={state.cards.length === 0} onMore={loadMore} />
    </div>
  );
}

/** The foot of a paged list: loading, retry, "加载更多" after a few automatic pages, or the end. */
function FeedEnd({ loading, error, hasMore, manual, empty, onMore }: { loading: boolean; error: boolean; hasMore: boolean; manual: boolean; empty: boolean; onMore: () => void }) {
  return (
    <div className="flex justify-center py-6">
      {loading ? (
        <span className="inline-flex items-center gap-2 text-13 text-ink-4">
          <RingMark className="size-4 text-accent" spinning /> 正在加载
        </span>
      ) : error ? (
        <button type="button" onClick={onMore} className="h-9 rounded-full border border-hot/30 px-4 text-13 text-hot hover:bg-hot-soft">
          加载失败，点此重试
        </button>
      ) : hasMore ? (
        manual && (
          <button type="button" onClick={onMore} className="h-9 rounded-full border border-line-strong bg-surface px-5 text-13 font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink">
            加载更多
          </button>
        )
      ) : (
        !empty && <span className="text-12 text-ink-4">已经到底了</span>
      )}
    </div>
  );
}

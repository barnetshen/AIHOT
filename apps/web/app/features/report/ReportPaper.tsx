// One report, set as the rest of the site is: a large date title over the issue's figures, the lead in a
// card of its own, today's highlights as a numbered list, then one grouped list per section, 快讯, the
// neighbouring issues and a closing line. Rows in a list are parted by inset hairlines.
import { IntentLink } from "../../components/ui/IntentLink";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { ReportCitation, ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { SITE, subjectAfter, withSubject } from "@aihot/site";
import { Badge } from "../../components/ui/Badge";
import { IconArrowUpRight, IconChevronLeft, IconChevronRight } from "../../components/icons";
import type { OutlineEntry } from "../../components/ui/OutlineSheet";
import { SourceAvatar } from "../../components/ui/SourceAvatar";
import { monthDay } from "../../lib/format";
import { KIND_LABEL, headline, metricItems, neighbourLabel, reportPath, reportTitle, shortDay } from "./format";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (c: ReportCitation) => c.itemId ?? c.title;
const anchorOf = (c: ReportCitation) => (c.itemId ? `r-${c.itemId}` : null);
const SCROLL = "scroll-mt-[calc(var(--bar-h)+1.5rem)]";
/** What comes before `noun` at the end of `phrase` ("往期 AI " of "往期 AI 周报"), so the kind's name is its own text. */
const before = (phrase: string, noun: string) => phrase.slice(0, -noun.length);

function Masthead({ report, quiet }: { report: ReportDetail; quiet: boolean }) {
  const label = KIND_LABEL[report.kind];
  const facts = [...metricItems(report.metrics).map((m) => `${m.value} ${m.unit}`), `约 ${report.readingMinutes} 分钟读完`];
  return (
    <header data-masthead="" className="pt-1 lg:pt-0">
      <p className="text-14 font-semibold text-ink-4">
        {withSubject(label)} · 第 <span className="num">{report.issueNumber}</span> 期
      </p>
      <h1 id="report-start" className={`mt-0.5 text-32 font-bold leading-[1.2] tracking-[-0.025em] text-ink lg:text-40 ${SCROLL}`}>
        <span className="sr-only">{withSubject(label)} · </span>
        {reportTitle(report.kind, report.key)}
      </h1>
      {!quiet && <p className="num mt-2 text-15 text-ink-3">{facts.join(" · ")}</p>}
    </header>
  );
}

/** Source face and name, and the site's 一手 mark when first-hand. */
function Source({ c, size = 16 }: { c: ReportCitation; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <SourceAvatar name={c.sourceName} iconUrl={c.sourceIconUrl} iconSrcSet={c.sourceIconSrcSet} size={size} />
      <span className="truncate font-medium text-ink-2">{c.sourceName}</span>
      {c.firstParty && <Badge tone="accent">一手</Badge>}
    </span>
  );
}

/**
 * The way on from a story: its original. Each story is one report (for an event, the one the edition
 * chose: first-hand first, then the best scored), so there is one place to go.
 */
function Original({ c, className = "" }: { c: ReportCitation; className?: string }) {
  return (
    <a
      href={c.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`阅读${c.sourceName}原文：${c.title}（新标签页）`}
      className={`relative z-10 inline-flex min-h-8 items-center gap-0.5 text-14 text-accent transition-opacity hover:opacity-70 ${className}`}
    >
      原文 <IconArrowUpRight size={13} />
    </a>
  );
}

/**
 * Under a daily entry: the event's other developments, or other reports of the launch it stands for.
 * Titles only, each to its page; a withdrawn one stays, struck through.
 */
function Related({ items, className = "" }: { items: ReportCitation[]; className?: string }) {
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.slice(0, 4).map((r) => (
        <li key={keyOf(r)} className="flex gap-2.5 text-14 leading-[1.6]">
          <span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-4" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {r.available && r.itemId ? (
              <IntentLink viewTransition to={`/items/${r.itemId}`} className="relative z-10 text-ink-2 transition-colors hover:text-accent">
                {r.title}
              </IntentLink>
            ) : (
              <span title={WITHDRAWN_NOTE} className="text-ink-4 line-through">{r.title}</span>
            )}
            {r.available && <span className="ml-2 text-12 text-ink-4">{r.sourceName}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** How many more sources reported the entry's event, and whether an earlier daily covered it. */
function Coverage({ c }: { c: ReportCitation }) {
  return (
    <>
      {!!c.otherSources && <span className="shrink-0 text-ink-4">另有 {c.otherSources} 家报道</span>}
      {c.followUp && <Badge title={`${monthDay(c.followUp)}的日报报道过这件事，这里是新进展`}>跟进</Badge>}
    </>
  );
}

/** A row of a grouped list: an inset hairline above every row but the first. */
function Row({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <li id={id} className={`group/row relative ${SCROLL} ${className}`}>
      <span aria-hidden="true" className="absolute left-5 right-0 top-0 h-px bg-line-soft group-first/row:hidden lg:left-6" />
      {children}
    </li>
  );
}

/** One story: source, headline, at most three lines of summary, then the original. */
function Story({ c, dated }: { c: ReportCitation; dated: boolean }) {
  return (
    <Row id={anchorOf(c) ?? undefined} className="px-5 py-4 lg:px-6 lg:py-5">
      <div className="flex items-center gap-2 text-13 text-ink-4">
        <Source c={c} />
        {c.available && <Coverage c={c} />}
        {dated && c.publishedAt && <span className="num ml-auto shrink-0">{shortDay(c.publishedAt)}</span>}
      </div>
      {c.available ? (
        <>
          <h3 className="mt-2 text-18 font-semibold leading-[1.45] tracking-[-0.01em] text-ink [overflow-wrap:anywhere] [text-wrap:pretty] lg:text-20">
            {c.itemId ? (
              <IntentLink viewTransition to={`/items/${c.itemId}`} className="transition-colors hover:text-accent">
                {c.title}
              </IntentLink>
            ) : (
              c.title
            )}
          </h3>
          {c.summary && <p className="mt-1.5 line-clamp-3 text-15 leading-[1.7] text-ink-3 [overflow-wrap:anywhere]">{c.summary}</p>}
          {!!c.related?.length && <Related items={c.related} className="mt-3" />}
          <Original c={c} className="mt-1.5" />
        </>
      ) : (
        <p className="mt-2 text-14 leading-relaxed text-ink-4">
          <span className="line-through">{c.title}</span> · {WITHDRAWN_NOTE}
        </p>
      )}
    </Row>
  );
}

interface Page {
  id: string;
  label: string;
  summary: string | null;
  items: ReportCitation[];
}

/**
 * The story an issue leads with: the item it names.
 * Only a public item leads: a withdrawn one stays in its page, marked.
 */
function leadStoryOf(report: ReportDetail): ReportCitation | null {
  if (!report.leadItemId) return null;
  return report.sections.flatMap((s) => s.items).find((c) => c.itemId === report.leadItemId && c.available) ?? null;
}

const WITHDRAWN_NOTE = "该内容已按来源方要求下架或调整展示方式。";

/**
 * Sections as pages. A story cited twice appears once, and
 * the story leading the front page is not repeated inside.
 */
function pagesOf(report: ReportDetail, leadStory: ReportCitation | null): Page[] {
  const seen = new Set<string>(leadStory ? [keyOf(leadStory)] : []);
  return report.sections
    .map((s, i) => ({
      id: `s-${i + 1}`,
      label: s.label,
      summary: s.summary,
      items: s.items
        .filter((c) => {
          const k = keyOf(c);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
    }))
    .filter((p) => p.items.length > 0);
}

/**
 * The lead's picture across the top of its card; landscape pictures are cropped to between 16:10 and 2:1.
 * A picture that is not the lead's own (a weekly or monthly's, from its first highlight) is captioned
 * with its story.
 */
function LeadPicture({ cover, onError }: { cover: NonNullable<ReportDetail["cover"]>; onError: () => void }) {
  const ratio = cover.width && cover.height ? cover.width / cover.height : 16 / 9;
  return (
    <figure>
      <div className="overflow-hidden bg-bg-sunk" style={{ aspectRatio: Math.min(2, Math.max(1.6, ratio)) }}>
        <img src={cover.url} srcSet={cover.srcSet}
          sizes="(min-width: 1024px) 860px, calc(100vw - 32px)"
          width={cover.width ?? undefined} height={cover.height ?? undefined}
          alt="" loading="eager" fetchPriority="high" decoding="async" onError={onError} className="size-full object-cover" />
      </div>
      {cover.caption && <figcaption className="line-clamp-2 px-5 pt-3 text-13 leading-[1.6] text-ink-4 lg:px-8">{cover.caption}</figcaption>}
    </figure>
  );
}

/** A small coloured word over a block: 头条, 本期导读. */
function Eyebrow({ tone = "accent", children }: { tone?: "accent" | "hot"; children: ReactNode }) {
  return <p className={`text-14 font-semibold ${tone === "hot" ? "text-hot" : "text-accent"}`}>{children}</p>;
}

/**
 * A weekly's or monthly's overview. Such an issue leading with an event sets the event as a daily does,
 * so the overview opens the issue above it.
 */
function Overview({ text }: { text: string }) {
  return (
    <section aria-label="本期导读" className="card mt-6 px-5 py-5 lg:px-8 lg:py-7">
      <Eyebrow>本期导读</Eyebrow>
      <p className="mt-2 text-16 leading-[1.8] text-ink-2 lg:text-17">{text}</p>
    </section>
  );
}

/** The lead in its own card: the picture, the headline, the paragraph and where it comes from. */
function Lead({ report, leadStory, count }: { report: ReportDetail; leadStory: ReportCitation | null; count: number }) {
  const daily = report.kind === "daily";
  // A weekly or monthly leading with an event: the event's own summary; its overview stands above (Overview).
  const byEvent = daily || !!leadStory;
  // A picture that fails to load is dropped, and the lead is set as if it had none.
  const [broken, setBroken] = useState<string | null>(null);
  const cover = report.cover && report.cover.url !== broken ? report.cover : null;
  const title = report.lead?.title ?? leadStory?.title ?? headline(report.kind, report.key, count);
  const dek = daily || !leadStory ? (report.lead?.leadParagraph ?? leadStory?.summary ?? report.overview) : leadStory.summary;
  return (
    <section aria-label="头条" id={leadStory ? (anchorOf(leadStory) ?? undefined) : undefined} className={`card mt-6 overflow-hidden ${SCROLL}`}>
      {cover && <LeadPicture cover={cover} onError={() => setBroken(cover.url)} />}
      <div className="px-5 pb-5 pt-5 lg:px-8 lg:pb-7 lg:pt-7">
        <Eyebrow tone={byEvent ? "hot" : "accent"}>{byEvent ? "头条" : "本期导读"}</Eyebrow>
        <h2 className="mt-1.5 text-26 font-bold leading-[1.3] tracking-[-0.025em] text-ink [text-wrap:pretty] lg:text-36 lg:leading-[1.22]">
          {leadStory?.itemId ? (
            <IntentLink viewTransition to={`/items/${leadStory.itemId}`} className="transition-colors hover:text-accent">
              {title}
            </IntentLink>
          ) : (
            title
          )}
        </h2>
        {dek && <p className="mt-3 text-16 leading-[1.75] text-ink-2 lg:mt-4 lg:text-18">{dek}</p>}
        {leadStory && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-13 lg:mt-5">
            <Source c={leadStory} size={18} />
            <Coverage c={leadStory} />
            <Original c={leadStory} className="ml-auto" />
          </div>
        )}
        {!!leadStory?.related?.length && <Related items={leadStory.related} className="mt-4 border-t border-line-soft pt-4" />}
      </div>
    </section>
  );
}

/** Today's highlights, numbered, each to its story below (or its page). */
function Highlights({ report, leadStory, inPage }: { report: ReportDetail; leadStory: ReportCitation | null; inPage: Set<string | null> }) {
  const highlights = report.highlights.filter((h) => !leadStory || keyOf(h) !== keyOf(leadStory)).slice(0, 3);
  if (highlights.length === 0) return null;
  const period = report.kind === "daily" ? "今日" : report.kind === "weekly" ? "本周" : "本月";
  return (
    <SectionPage id="highlights" label={`${period}看点`}>
      <ol className="card overflow-hidden">
        {highlights.map((h, i) => {
          const anchor = anchorOf(h);
          const to = anchor && inPage.has(h.itemId) ? `#${anchor}` : h.itemId ? `/items/${h.itemId}` : h.sourceUrl;
          const no = <span className="num w-5 shrink-0 text-20 font-bold leading-[1.35] text-ink-4">{i + 1}</span>;
          return (
            <Row key={keyOf(h)}>
              {h.available ? (
                <Link to={to} viewTransition={to.startsWith("/")} className="group flex gap-3.5 px-5 py-3.5 transition-colors active:bg-bg-sunk lg:px-6 lg:py-4 lg:hover:bg-surface-2">
                  {no}
                  <span className="min-w-0 flex-1">
                    <span className="block text-16 font-semibold leading-[1.5] text-ink lg:text-17">{h.title}</span>
                    <span className="mt-0.5 block truncate text-13 text-ink-4">{h.sourceName}</span>
                  </span>
                  <IconChevronRight size={16} className="mt-1 shrink-0 self-center text-ink-4" />
                </Link>
              ) : (
                <div className="flex gap-3.5 px-5 py-3.5 lg:px-6 lg:py-4">
                  {no}
                  <span className="min-w-0 text-14 leading-[1.55] text-ink-4">
                    <span className="line-through">{h.title}</span>
                    <span className="mt-1 block text-12">{WITHDRAWN_NOTE}</span>
                  </span>
                </div>
              )}
            </Row>
          );
        })}
      </ol>
    </SectionPage>
  );
}

/** The issue's sections as a row of chips to jump to (wide screens; phones have the outline sheet). */
function PageIndex({ pages, flashes }: { pages: Page[]; flashes: number }) {
  const index = [...pages.map((p) => ({ id: p.id, label: p.label, n: p.items.length })), ...(flashes > 0 ? [{ id: "s-flash", label: "快讯", n: flashes }] : [])];
  if (index.length < 2) return null;
  return (
    <nav aria-label="本期版面" className="mt-5 hidden flex-wrap gap-2 lg:flex">
      {index.map((p) => (
        <a key={p.id} href={`#${p.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-field px-3.5 text-14 text-ink-2 transition-colors hover:text-ink">
          {p.label}
          <span className="num text-13 text-ink-4">{p.n}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * The page of a day with nothing new: the lead alone in its card, saying so and naming the hours it
 * covers. No highlights or sections follow.
 */
function QuietFront({ lead }: { lead: NonNullable<ReportDetail["lead"]> }) {
  return (
    <section aria-label="头条" className="card mt-6 px-5 py-6 lg:px-8 lg:py-8">
      <h2 className="text-24 font-bold leading-[1.3] tracking-[-0.02em] text-ink [text-wrap:balance] lg:text-30">{lead.title}</h2>
      {lead.leadParagraph && <p className="mt-3 text-16 leading-[1.75] text-ink-2 lg:text-17">{lead.leadParagraph}</p>}
    </section>
  );
}

/** A part of the page: its heading, how many it holds, then its list. */
export function SectionPage({ id, label, note, children }: { id: string; label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={`pt-9 lg:pt-11 ${SCROLL}`}>
      <div className="flex items-baseline justify-between gap-4 pb-2.5">
        <h2 id={`${id}-t`} className="min-w-0 text-22 font-bold tracking-[-0.02em] text-ink lg:text-24">
          {label}
        </h2>
        {note && <span className="num shrink-0 text-14 text-ink-4">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Neighbours({ report, index }: { report: ReportDetail; index: ReportNavigationEntry[] }) {
  const titleOf = (key: string) => index.find((e) => e.key === key)?.title ?? `${withSubject(KIND_LABEL[report.kind])} · ${key}`;
  const cell = "card card-hover group flex min-w-0 flex-col px-4 py-4 lg:px-5";
  const title = "mt-1.5 line-clamp-2 text-15 font-semibold leading-[1.5] text-ink transition-colors group-hover:text-accent lg:text-16";
  if (!report.prev && !report.next) return null;
  return (
    <nav aria-label={report.kind === "daily" ? "前后日报" : "前后各期"} className="mt-10 grid grid-cols-2 gap-3">
      {report.prev ? (
        <Link to={reportPath(report.kind, report.prev)} className={cell}>
          <span className="inline-flex items-center gap-0.5 text-13 text-ink-4">
            <IconChevronLeft size={14} /> {neighbourLabel(report.kind, report.prev, "prev")}
          </span>
          <span className={title}>{titleOf(report.prev)}</span>
        </Link>
      ) : (
        <span />
      )}
      {report.next ? (
        <Link to={reportPath(report.kind, report.next)} className={`${cell} items-end text-right`}>
          <span className="inline-flex items-center gap-0.5 text-13 text-ink-4">
            {neighbourLabel(report.kind, report.next, "next")} <IconChevronRight size={14} />
          </span>
          <span className={title}>{titleOf(report.next)}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function History({ report, index }: { report: ReportDetail; index: ReportNavigationEntry[] }) {
  const others = index.filter((e) => e.key !== report.key).slice(0, 12);
  if (others.length === 0) return null;
  const label = KIND_LABEL[report.kind];
  return (
    <SectionPage id="report-history" label={`${before(subjectAfter("往期", label), label)}${label}`}>
      <ul className="card overflow-hidden">
        {others.map((e) => (
          <Row key={e.key}>
            <Link to={reportPath(report.kind, e.key)} className="group flex items-center gap-4 px-5 py-3 transition-colors lg:px-6 lg:hover:bg-surface-2">
              <span className="num w-[76px] shrink-0 text-14 text-ink-4">{e.key}</span>
              <span className="min-w-0 flex-1 truncate text-15 text-ink">{e.title ?? `${SITE.name} ${KIND_LABEL[report.kind]} · ${e.key}`}</span>
              <IconChevronRight size={15} className="shrink-0 text-ink-4" />
            </Link>
          </Row>
        ))}
      </ul>
    </SectionPage>
  );
}

/** The issue's parts for the phone outline: the top, each section, then 快讯. */
export function reportOutline(report: ReportDetail): OutlineEntry[] {
  const pages = pagesOf(report, leadStoryOf(report));
  if (pages.length === 0 && report.flashes.length === 0) return [];
  return [
    { id: "report-start", text: "头条", level: 2, mark: "" },
    ...pages.map((p, i) => ({ id: p.id, text: p.label, level: 2, mark: pad(i + 1), note: `${p.items.length} 件` })),
    ...(report.flashes.length > 0 ? [{ id: "s-flash", text: "快讯", level: 2, mark: pad(pages.length + 1), note: `${report.flashes.length} 条` }] : []),
  ];
}

export function ReportPaper({ report, index }: { report: ReportDetail; index: ReportNavigationEntry[] }) {
  const daily = report.kind === "daily";
  const leadStory = leadStoryOf(report);
  const pages = pagesOf(report, leadStory);
  const count = pages.reduce((sum, p) => sum + p.items.length, 0) + (leadStory ? 1 : 0);
  // Only a daily comes out with nothing in it: a day the editors judged with nothing new (REPORTS.quiet).
  const quiet = count === 0 && report.flashes.length === 0;
  const inPage = new Set(pages.flatMap((p) => p.items.map((c) => c.itemId)).filter(Boolean));
  return (
    <article>
      <Masthead report={report} quiet={quiet} />
      {quiet ? (
        report.lead && <QuietFront lead={report.lead} />
      ) : (
        <>
          <PageIndex pages={pages} flashes={report.flashes.length} />
          {!daily && leadStory && report.overview && <Overview text={report.overview} />}
          <Lead report={report} leadStory={leadStory} count={count} />
          <Highlights report={report} leadStory={leadStory} inPage={inPage} />
        </>
      )}

      {pages.map((p) => (
        <SectionPage key={p.id} id={p.id} label={p.label} note={`${p.items.length} 件`}>
          {p.summary && <p className="-mt-1 pb-3 text-15 leading-[1.7] text-ink-3">{p.summary}</p>}
          <ol className="card overflow-hidden">
            {p.items.map((c) => <Story key={`${p.id}-${keyOf(c)}`} c={c} dated={!daily} />)}
          </ol>
        </SectionPage>
      ))}

      {report.flashes.length > 0 && (
        <SectionPage id="s-flash" label="快讯" note={`${report.flashes.length} 条`}>
          <ul className="card overflow-hidden">
            {report.flashes.map((f, i) => (
              <Row key={`${keyOf(f)}-${i}`} className="px-5 py-3 text-15 leading-[1.6] lg:px-6">
                {!f.available ? (
                  <span className="text-ink-4">
                    <span className="line-through">{f.title}</span>
                    <span className="ml-2 text-12">{WITHDRAWN_NOTE}</span>
                  </span>
                ) : f.itemId ? (
                  <Link viewTransition to={`/items/${f.itemId}`} className="text-ink transition-colors hover:text-accent">
                    {f.title}
                  </Link>
                ) : (
                  <span className="text-ink">{f.title}</span>
                )}
                {f.available && <span className="ml-2 text-13 text-ink-4">{f.sourceName}</span>}
                {f.available && f.followUp && <Badge className="ml-2 align-[1px]" title={`${monthDay(f.followUp)}的日报报道过这件事，这里是新进展`}>跟进</Badge>}
              </Row>
            ))}
          </ul>
        </SectionPage>
      )}

      <Neighbours report={report} index={index} />
      {!daily && <History report={report} index={index} />}
      <footer className="py-10 text-center text-13 leading-relaxed text-ink-4">
        {`${SITE.name} `}{KIND_LABEL[report.kind]}由编辑系统根据公开来源自动{daily ? "编辑" : "综合"}，每条均附原文 ·{" "}
        <Link to={daily ? "/daily/archive" : "#report-history"} viewTransition={daily} className="text-accent transition-opacity hover:opacity-70">
          {daily ? "日报合订本" : `往期${KIND_LABEL[report.kind]}`}
        </Link>
      </footer>
    </article>
  );
}

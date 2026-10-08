// What a video shows, scene by scene. An issue's comes from the issue as the public read layer gives it
// (loadReport): withdrawn citations are left out, so a withdrawal changes the scenes and with them the
// fingerprint. A daily leads with its lead and highlights, then its other entries; the ones that do not
// fit and its flashes become one screen of headlines. A weekly goes theme by theme with the first entries
// of each. An item's video is one screen about it, from the selected list as the site shows it.
// A screen about a report plays the report's own video when it has one (clips.ts), else it is text.
import { createHash } from "node:crypto";
import type { ReportCitation, ReportDetail, TimelineCard } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { beijingDate, beijingTime, beijingWeekday, isoWeekRange } from "@aihot/contracts/time";
import { withSubject } from "@aihot/site";
import { clamp } from "@aihot/backend/media/og";
import { dailyUrl, periodUrl } from "@aihot/backend/publication/links";
import type { VideoKind } from "../types.ts";
import { CLIP_SECONDS } from "./clips.ts";

/** Bump when the drawing or the timing changes: every video is rendered again. */
export const VIDEO_TEMPLATE_VERSION = "video-2026-10-08.2";

type IssueKind = Exclude<VideoKind, "item">;

export interface Entry {
  title: string;
  summary: string | null;
  source: string;
  /** First-hand (the issue's citation says so; the selected list does not). */
  firstParty: boolean;
  /** Other sources that reported the event. */
  others: number;
  /** A video of the news to play on its screen (clips.ts). */
  clip: string | null;
}

export type Scene =
  | { type: "cover"; kind: IssueKind; period: string; issueNumber: number; headline: string | null; overview: string | null; count: number }
  | { type: "entry"; kind: IssueKind; period: string; rank: number; total: number; section: string; entry: Entry }
  | { type: "theme"; kind: IssueKind; period: string; index: number; total: number; heading: string; summary: string | null }
  | { type: "headlines"; kind: IssueKind; period: string; titles: string[] }
  | { type: "outro"; kind: IssueKind; url: string }
  | { type: "item"; label: string; time: string; entry: Entry };

/** Entries told one screen each. */
const DAILY_ENTRIES = 8;
const WEEKLY_THEMES = 5;
const WEEKLY_PER_THEME = 2;
const WEEKLY_ENTRIES = 10;
const HEADLINES = 6;

type Clips = ReadonlyMap<string, string>;

function entryOf(c: { itemId?: string | null; id?: string; title: string; summary: string | null; sourceName: string; firstParty: boolean; others: number }, clips: Clips): Entry {
  const clip = clips.get(c.itemId ?? c.id ?? "") ?? null;
  // A screen with a video has less room for the summary.
  return { title: clamp(c.title, 60), summary: c.summary ? clamp(c.summary, clip ? 72 : 110) : null, source: c.sourceName, firstParty: c.firstParty, others: c.others, clip };
}

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** "10月7日 星期三", "10月5日—10月11日". */
export function periodLabel(kind: IssueKind, key: string): string {
  if (kind === "daily") return `${md(key)} ${beijingWeekday(key)}`;
  const range = isoWeekRange(key);
  return range ? `${md(range.start)}—${md(range.end)}` : key;
}

/** "10月8日 14:30" in Beijing time. */
export const momentLabel = (at: Date) => `${md(beijingDate(at))} ${beijingTime(at)}`;

/** The items an issue's video would tell, for looking up their videos before the scenes are made. */
export function toldItems(report: ReportDetail): string[] {
  return report.sections.flatMap((s) => s.items).filter((c) => c.available && c.itemId).map((c) => c.itemId!);
}

/** The scenes of an issue; none when nothing it cites is still public. */
export function scenesOf(report: ReportDetail, clips: Clips = new Map()): Scene[] {
  const kind = report.kind;
  if (kind !== "daily" && kind !== "weekly") return [];
  const period = periodLabel(kind, report.key);
  const url = kind === "daily" ? dailyUrl(report.key) : periodUrl(kind, report.key);
  const shown = (c: ReportCitation) => c.available && !!c.itemId;
  const cited = (c: ReportCitation) => entryOf({ ...c, others: c.otherSources ?? 0 }, clips);
  const body: Scene[] = [];
  let count: number;
  if (kind === "daily") {
    const all = report.sections.flatMap((s) => s.items.filter(shown).map((item) => ({ item, section: s.label })));
    // The lead first, then the highlights, then the sections in order.
    const first = [report.leadItemId, ...report.highlights.map((h) => h.itemId)].filter((id): id is string => !!id);
    const order = (id: string | null) => (first.includes(id!) ? first.indexOf(id!) : first.length);
    const ranked = all.map((e, i) => ({ ...e, i })).sort((a, b) => order(a.item.itemId) - order(b.item.itemId) || a.i - b.i);
    const told = ranked.slice(0, DAILY_ENTRIES);
    told.forEach((e, i) => body.push({ type: "entry", kind, period, rank: i + 1, total: told.length, section: e.section, entry: cited(e.item) }));
    const titles = [...ranked.slice(DAILY_ENTRIES).map((e) => e.item), ...report.flashes.filter(shown)].slice(0, HEADLINES).map((c) => clamp(c.title, 40));
    if (titles.length) body.push({ type: "headlines", kind, period, titles });
    count = all.length + report.flashes.filter(shown).length;
  } else {
    const themes = report.sections.map((s) => ({ ...s, items: s.items.filter(shown) })).filter((s) => s.items.length).slice(0, WEEKLY_THEMES);
    // Fewer entries per theme than the cap would leave room; the cap keeps a long week watchable.
    const total = Math.min(WEEKLY_ENTRIES, themes.reduce((n, t) => n + Math.min(WEEKLY_PER_THEME, t.items.length), 0));
    let rank = 0;
    themes.forEach((t, i) => {
      if (rank >= total) return;
      body.push({ type: "theme", kind, period, index: i + 1, total: themes.length, heading: clamp(t.label, 24), summary: t.summary ? clamp(t.summary, 90) : null });
      for (const item of t.items.slice(0, WEEKLY_PER_THEME)) {
        if (rank >= total) break;
        body.push({ type: "entry", kind, period, rank: ++rank, total, section: t.label, entry: cited(item) });
      }
    });
    count = report.sections.reduce((n, s) => n + s.items.filter(shown).length, 0);
  }
  if (!body.length) return [];
  const headline = report.lead?.title ?? null;
  const overview = kind === "weekly" ? report.overview : null;
  return [
    { type: "cover", kind, period, issueNumber: report.issueNumber, headline: headline && clamp(headline, 48), overview: overview && clamp(overview, 90), count },
    ...body,
    { type: "outro", kind, url },
  ];
}

/** An item's one scene, from its card in the selected list. */
export function itemScenes(card: TimelineCard, clips: Clips = new Map()): Scene[] {
  const item = card.item;
  return [{
    type: "item",
    label: (item.category && CATEGORY_LABELS[item.category]) || withSubject("动态"),
    time: momentLabel(new Date(item.timelineAt)),
    entry: entryOf({ id: item.id, title: item.title, summary: item.summary, sourceName: item.source.name, firstParty: false, others: (card.group?.additionalSourceCount ?? 0) + 1 }, clips),
  }];
}

/** Seconds on screen: long enough to read the text at about nine characters a second, or to play its video. */
export function secondsOf(scene: Scene, clipSeconds: number | null = null): number {
  const chars = (text: string | null) => [...(text ?? "")].length;
  switch (scene.type) {
    case "cover": return scene.overview ? 6 : 4;
    case "entry":
    case "item": {
      const reading = Math.min(12, Math.max(5, 2 + (chars(scene.entry.title) + chars(scene.entry.summary)) / 9));
      return clipSeconds === null ? reading : Math.max(reading, Math.min(CLIP_SECONDS, clipSeconds));
    }
    case "theme": return Math.min(7, Math.max(3.5, 2 + chars(scene.summary) / 10));
    case "headlines": return Math.min(10, 3 + 1.2 * scene.titles.length);
    case "outro": return 4;
  }
}

/** Names what a video shows and how it is drawn: the same issue or item as before keeps its video. */
export function fingerprintOf(scenes: Scene[]): string {
  return createHash("sha256").update(VIDEO_TEMPLATE_VERSION).update(JSON.stringify(scenes)).digest("hex").slice(0, 16);
}

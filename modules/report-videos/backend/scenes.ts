// What a broadcast shows and says, scene by scene, from an issue as the public read layer gives it
// (loadReport): withdrawn citations are left out, so a withdrawal changes the scenes and with them the
// fingerprint. A daily leads with its lead and highlights, then its other entries; the ones that do not
// fit and its flashes become one screen of headlines. A weekly goes theme by theme with the first
// entries of each. What is said is put together by rule from the issue's own words (no model call), and
// a screen about a report shows the report's own video or picture when it has one (media.ts).
import { createHash } from "node:crypto";
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { beijingWeekday, isoWeekRange } from "@aihot/contracts/time";
import { SITE, withSubject } from "@aihot/site";
import { clamp } from "@aihot/backend/media/og";
import { dailyUrl, periodUrl } from "@aihot/backend/publication/links";
import type { VideoKind } from "../types.ts";
import type { NewsMedia } from "./media.ts";
import { VOICE } from "./voice.ts";

/** Bump when the drawing, the timing or the wording changes: every video is rendered again. */
export const VIDEO_TEMPLATE_VERSION = `video-2026-10-09.1+${VOICE}`;

export interface Entry {
  title: string;
  summary: string | null;
  source: string;
  firstParty: boolean;
  /** Other sources that reported the event. */
  others: number;
  /** The news' own video and picture (media.ts). */
  video: string | null;
  image: string | null;
}

export type Scene =
  | { type: "cover"; kind: VideoKind; period: string; issueNumber: number; headline: string | null; overview: string | null; count: number }
  | { type: "entry"; kind: VideoKind; period: string; rank: number; total: number; section: string; entry: Entry }
  | { type: "theme"; kind: VideoKind; period: string; index: number; total: number; heading: string; summary: string | null }
  | { type: "headlines"; kind: VideoKind; period: string; titles: string[] }
  | { type: "outro"; kind: VideoKind; url: string };

/** Entries told one screen each. */
const DAILY_ENTRIES = 8;
const WEEKLY_THEMES = 5;
const WEEKLY_PER_THEME = 2;
const WEEKLY_ENTRIES = 10;
const HEADLINES = 6;

type Media = ReadonlyMap<string, NewsMedia>;

function entryOf(c: ReportCitation, media: Media): Entry {
  const found = media.get(c.itemId ?? "");
  // A screen with a video or a picture has less room for the summary.
  return {
    title: clamp(c.title, 60), summary: c.summary ? clamp(c.summary, found ? 72 : 110) : null, source: c.sourceName, firstParty: c.firstParty,
    others: c.otherSources ?? 0, video: found?.video ?? null, image: found?.image ?? null,
  };
}

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
export const issueName = (kind: VideoKind) => withSubject(kind === "daily" ? "日报" : "周报");

/** "10月7日 星期三", "10月5日—10月11日". */
export function periodLabel(kind: VideoKind, key: string): string {
  if (kind === "daily") return `${md(key)} ${beijingWeekday(key)}`;
  const range = isoWeekRange(key);
  return range ? `${md(range.start)}—${md(range.end)}` : key;
}

/** The items an issue's video would tell, for looking up their videos and pictures before the scenes are made. */
export function toldItems(report: ReportDetail): string[] {
  return report.sections.flatMap((s) => s.items).filter((c) => c.available && c.itemId).map((c) => c.itemId!);
}

/** The scenes of an issue; none when nothing it cites is still public. */
export function scenesOf(report: ReportDetail, media: Media = new Map()): Scene[] {
  const kind = report.kind;
  if (kind !== "daily" && kind !== "weekly") return [];
  const period = periodLabel(kind, report.key);
  const url = kind === "daily" ? dailyUrl(report.key) : periodUrl(kind, report.key);
  const shown = (c: ReportCitation) => c.available && !!c.itemId;
  const body: Scene[] = [];
  let count: number;
  if (kind === "daily") {
    const all = report.sections.flatMap((s) => s.items.filter(shown).map((item) => ({ item, section: s.label })));
    // The lead first, then the highlights, then the sections in order.
    const first = [report.leadItemId, ...report.highlights.map((h) => h.itemId)].filter((id): id is string => !!id);
    const order = (id: string | null) => (first.includes(id!) ? first.indexOf(id!) : first.length);
    const ranked = all.map((e, i) => ({ ...e, i })).sort((a, b) => order(a.item.itemId) - order(b.item.itemId) || a.i - b.i);
    const told = ranked.slice(0, DAILY_ENTRIES);
    told.forEach((e, i) => body.push({ type: "entry", kind, period, rank: i + 1, total: told.length, section: e.section, entry: entryOf(e.item, media) }));
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
        body.push({ type: "entry", kind, period, rank: ++rank, total, section: t.label, entry: entryOf(item, media) });
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

/** Text as it is read aloud: marks the voice would skip or misread become pauses; an ellipsis left by clamping is dropped. */
export function spoken(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/[：:｜|·•]/g, "，").replace(/[《》「」『』【】"“”]/g, "").replace(/…$/, "").replace(/\s+/g, " ").trim();
}

/** What the anchor says over a scene. */
export function narration(scene: Scene): string {
  const end = (s: string) => (/[。！？!?]$/.test(s) ? s : `${s}。`);
  switch (scene.type) {
    case "cover":
      return [
        `这里是${SITE.name}${issueName(scene.kind)}，${scene.kind === "daily" ? `今天是${scene.period}` : `本周是${scene.period}`}，本期一共${scene.count}条。`,
        scene.overview ? end(spoken(scene.overview)) : "",
      ].join("");
    case "entry":
      return [`${scene.rank}。`, end(spoken(scene.entry.title)), scene.entry.summary ? end(spoken(scene.entry.summary)) : ""].join("");
    case "theme":
      return [`本周主线${scene.index}，`, end(spoken(scene.heading)), scene.summary ? end(spoken(scene.summary)) : ""].join("");
    case "headlines":
      return `再来看几条快讯。${scene.titles.map((t) => end(spoken(t))).join("")}`;
    case "outro":
      return `以上就是本期${issueName(scene.kind)}。每条新闻的原文链接，都在${SITE.name}的图文版里。${scene.kind === "daily" ? "我们明天见。" : "我们下周见。"}`;
  }
}

/** Names what a video shows, says and how it is drawn: the same issue as before keeps its video. */
export function fingerprintOf(scenes: Scene[]): string {
  return createHash("sha256").update(VIDEO_TEMPLATE_VERSION).update(JSON.stringify(scenes)).digest("hex").slice(0, 16);
}

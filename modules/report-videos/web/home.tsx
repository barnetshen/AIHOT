// The broadcasts on the home page: a strip of covers to swipe through where the page has one column
// (phones, narrower desktops), and a featured cover with the next few at the head of the side column on
// wide desktops. Both open the player on that broadcast. The list (/api/videos) is read with the page;
// without one, neither shows.
import { Link } from "react-router";
import type { HomePart } from "@aihot/web/modules";
import { SectionHead } from "@aihot/web/components/ui/Page";
import type { VideoEntry, VideosResponse } from "../types.ts";
import { clock, entries, playerUrl } from "./shared.ts";

/** The newest daily, the newest weekly, then the earlier dailies. */
function ordered(data: unknown): VideoEntry[] {
  const videos = data as VideosResponse | null;
  if (!videos) return [];
  const [first, ...rest] = videos.daily;
  return [first, videos.weekly[0], ...rest].filter((v): v is VideoEntry => !!v);
}

const kindLabel = (v: VideoEntry) => (v.kind === "daily" ? "日报" : "周报");
/** "10月8日" of a daily, the week of a weekly. */
const when = (v: VideoEntry) => (v.kind === "daily" ? v.period.split(" ")[0] : v.period);

function PlayGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

function Heading({ id }: { id: string }) {
  return <SectionHead id={id} title="视频播报" to="/videos" more="全部" />;
}

export function VideoStrip({ data }: { data: unknown }) {
  const list = ordered(data);
  if (!list.length) return null;
  return (
    <section aria-labelledby="home-videos" className="pb-2">
      <Heading id="home-videos" />
      <ul className="scrollbar-none bleed flex snap-x snap-mandatory scroll-px-[var(--gutter-l)] gap-2.5 overflow-x-auto pb-1 lg:mx-0 lg:scroll-px-0 lg:px-0">
        {list.map((v, i) => (
          <li key={`${v.kind}-${v.key}`} className="shrink-0 snap-start">
            <Link
              to={playerUrl(v)}
              aria-label={`看${kindLabel(v)}视频播报：${v.headline ?? v.title}`}
              className="group relative block aspect-[3/4] w-[116px] overflow-hidden rounded-tile bg-black shadow-[var(--shadow-card)] ring-1 ring-line-soft transition-transform duration-200 active:scale-95 lg:w-[132px]"
            >
              <img src={v.thumb} alt="" loading="lazy" className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              {i === 0 && <span className="bg-brand absolute left-1.5 top-1.5 rounded-full px-1.5 py-px text-11 font-bold text-white shadow">最新</span>}
              <span className="absolute inset-x-2 bottom-1.5 text-white">
                <span className="block truncate text-13 font-semibold leading-tight">{kindLabel(v)} · {when(v)}</span>
                <span className="mt-0.5 flex items-center gap-1 text-11 text-white/80">
                  <PlayGlyph size={9} />
                  <span className="num">{clock(v.durationSeconds)}</span>
                  <span>· {entries(v)} 条</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VideoRail({ data }: { data: unknown }) {
  const [lead, ...rest] = ordered(data);
  if (!lead) return null;
  return (
    <section aria-labelledby="rail-videos">
      <Heading id="rail-videos" />
      <Link
        to={playerUrl(lead)}
        aria-label={`看${kindLabel(lead)}视频播报：${lead.headline ?? lead.title}`}
        className="group relative block aspect-[4/5] overflow-hidden rounded-card bg-black shadow-[var(--shadow-soft)]"
      >
        <img src={lead.thumb} alt="" loading="lazy" className="size-full object-cover object-top transition-transform duration-700 ease-[var(--ease-out-quart)] group-hover:scale-[1.04]" />
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
        {/* The cover keeps its own words in view; the play mark comes up under the pointer. */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="flex size-16 scale-90 items-center justify-center rounded-full bg-white/90 pl-1 text-black shadow-lg transition-transform duration-300 group-hover:scale-100">
            <PlayGlyph size={26} />
          </span>
        </span>
        <span className="absolute inset-x-3 bottom-3 flex items-center gap-2.5 rounded-full bg-black/45 py-1.5 pl-1.5 pr-3 text-12 text-white/90 backdrop-blur-md">
          <span className="bg-brand flex size-6 shrink-0 items-center justify-center rounded-full pl-px text-white">
            <PlayGlyph size={11} />
          </span>
          <span className="min-w-0 flex-1 truncate">{kindLabel(lead)} · 第 {lead.issueNumber} 期 · {entries(lead)} 条要闻</span>
          <span className="num">{clock(lead.durationSeconds)}</span>
        </span>
      </Link>
      {rest.length > 0 && (
        <ul className="mt-2">
          {rest.slice(0, 3).map((v) => (
            <li key={`${v.kind}-${v.key}`}>
              <Link to={playerUrl(v)} className="group -mx-2 flex items-center gap-3 rounded-tile px-2 py-2 transition-colors hover:bg-surface dark:hover:bg-raised">
                <span className="relative block h-[52px] w-[39px] shrink-0 overflow-hidden rounded-mark bg-black">
                  <img src={v.thumb} alt="" loading="lazy" className="size-full object-cover object-top" />
                  <span className="absolute inset-0 flex items-center justify-center text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                    <PlayGlyph size={14} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-14 font-semibold text-ink transition-colors group-hover:text-accent">{v.headline ?? v.title}</span>
                  <span className="mt-0.5 block text-12 text-ink-4">{kindLabel(v)} · {when(v)} · <span className="num">{clock(v.durationSeconds)}</span></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default { api: "/api/videos", Top: VideoStrip, Rail: VideoRail } satisfies HomePart;

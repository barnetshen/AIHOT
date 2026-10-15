// One report in a feed, as a row of an Apple-style grouped list (the list draws the card around the rows;
// features/feed/Timeline.tsx): the source and the bookmark, the title, two lines of summary, and the
// time and score underneath. `hero` sets the day's lead larger, with the reason it was picked. Phones open
// duplicate reports in a sheet; desktop lists them under the row. One markup, two presentations.
import { memo } from "react";
import { Link } from "react-router";
import { IntentLink } from "../../components/ui/IntentLink";
import type { GroupInfo, FeedItemSummary, TimelineFilters } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { ITEM_COPY } from "@aihot/site";
import { SameEventBadge, SelectedBadge } from "../../components/ui/Badge";
import { ScoreLabel } from "../../components/ui/Score";
import { beijingTime } from "@aihot/contracts/time";
import { MediaThumbs, SourceLine, StarButton } from "./parts";
import { GroupButton, GroupSources } from "./ReadingGroup";
import { QuotedLine } from "../item/QuotedPost";
import { rememberPreview } from "../item/preview";

export interface FeedItemProps {
  item: FeedItemSummary;
  group?: GroupInfo | null;
  filters?: TimelineFilters;
  read?: boolean;
  onOpen?: (id: string) => void;
  /** Show category and tags under the text (全部动态, topics, search). */
  showTags?: boolean;
  /** The time the item sits at in its list; phones show it in the source line (desktop: on the rail). */
  at?: string;
  /** In the 精选 feed, where every item is a pick: the 精选 mark would say nothing (同一新闻 still shows). */
  inPicks?: boolean;
  /** The day's lead: larger type, three lines of summary and the reason it was picked. */
  hero?: boolean;
}

export const FeedItem = memo(function FeedItem({ item, group, filters, read = false, onOpen, showTags = false, at, inPicks = false, hero = false }: FeedItemProps) {
  const isX = item.channel === "x" && !!item.x;
  const open = () => {
    rememberPreview(item);
    onOpen?.(item.id);
  };
  const showSources = !!group && (group.additionalSourceCount > 0 || group.reportCount > 1);
  const tags = showTags ? item.tags.slice(0, 3) : [];
  const link = "after:absolute after:inset-0 after:content-['']";

  return (
    <article className="relative min-w-0" data-item-id={item.id}>
      <header className="flex min-h-5 items-center gap-2 text-13 leading-5">
        <SourceLine item={item} className="font-semibold text-ink-2" />
        {item.selected && (item.sameEvent || !inPicks) && (
          <span className="hidden lg:inline-flex">{item.sameEvent ? <SameEventBadge /> : <SelectedBadge />}</span>
        )}
        <span className="relative z-10 -my-2.5 -mr-2.5 ml-auto inline-flex shrink-0 text-ink-4">
          <StarButton item={item} className="size-10" />
        </span>
      </header>

      {isX ? (
        item.summary ? (
          <p className={`mt-1 whitespace-pre-line text-15 leading-[1.7] ${hero ? "line-clamp-6" : "line-clamp-4"} ${read ? "text-ink-4" : "text-ink"}`}>
            <IntentLink viewTransition to={`/items/${item.id}`} onClick={open} className={link}>
              {item.summary}
            </IntentLink>
          </p>
        ) : (
          <IntentLink viewTransition to={`/items/${item.id}`} onClick={open} aria-label={`查看 ${item.x!.authorName} 的帖子`} className="absolute inset-0" />
        )
      ) : (
        <>
          <h3
            className={`transition-colors duration-150 lg:group-hover/slot:text-accent ${read ? "text-ink-4" : "text-ink"} ${
              hero ? "mt-1.5 text-22 font-bold leading-[1.36] tracking-[-0.015em] lg:text-26 lg:leading-[1.32]" : "mt-1 line-clamp-3 text-17 font-semibold leading-[1.45] tracking-[-0.005em]"
            }`}
          >
            <IntentLink viewTransition to={`/items/${item.id}`} onClick={open} className={link}>
              {item.title}
            </IntentLink>
          </h3>
          {item.summary && (
            <p className={hero ? "mt-2 line-clamp-3 text-15 leading-[1.65] text-ink-3 lg:text-16" : "mt-1 line-clamp-2 text-14 leading-[1.6] text-ink-3"}>{item.summary}</p>
          )}
        </>
      )}

      {isX && item.x!.media.length > 0 && <MediaThumbs media={item.x!.media} className="mt-2.5" />}
      {isX && item.x!.quoted?.text && <QuotedLine quoted={item.x!.quoted} />}

      {hero && item.reason && (
        <p className="mt-3 text-13 leading-[1.65] text-ink-3">
          <span className="font-semibold text-ink-2">{ITEM_COPY.reasonLabel}</span>　{item.reason}
        </p>
      )}

      {item.sameEvent && (
        <p className="relative z-10 mt-1.5 line-clamp-1 text-13 text-ink-4">
          同一新闻，精选展示
          <Link viewTransition to={`/items/${item.sameEvent.id}`} className="text-ink-3 transition-colors hover:text-accent">
            《{item.sameEvent.title}》
          </Link>
        </p>
      )}

      <footer className="mt-2 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-12 leading-4 text-ink-4">
        {at && (
          <time dateTime={at} className="num">
            {beijingTime(at)}
          </time>
        )}
        <ScoreLabel score={item.score} compact />
        {showTags && item.category && (
          <Link to={`/all?category=${item.category}`} className="relative z-10 hover:text-accent">
            {CATEGORY_LABELS[item.category]}
          </Link>
        )}
        {tags.map((t) => (
          <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="relative z-10 hidden hover:text-accent lg:inline">
            #{t}
          </Link>
        ))}
      </footer>

      {group && showSources && (
        <div className="mt-2 hidden lg:block">
          <GroupSources group={group} filters={filters} parentId={item.id} />
        </div>
      )}
      {/* Phones: duplicate reports open in a sheet. */}
      {group && showSources && <GroupButton group={group} filters={filters} parentId={item.id} />}
    </article>
  );
});

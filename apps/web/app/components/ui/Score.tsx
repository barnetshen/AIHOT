import { ITEM_COPY } from "@aihot/site";

/**
 * The AI score as a quiet figure, set by tier rather than drawn as a bar: strong picks (85+) in ink with
 * a red dot before them, solid ones (70+) in ink, the rest greyed; a page of strong picks stays calm.
 * The score itself is unchanged.
 */
const TIERS = [
  { min: 85, className: "text-ink", dot: true },
  { min: 70, className: "text-ink-2", dot: false },
  { min: 0, className: "text-ink-4", dot: false },
];

/** The score readers see: none when the site keeps scores from them. */
export function shownScore(score: number | null): number | null {
  return ITEM_COPY.showScore ? score : null;
}

/** "AI 评分 · 88" on desktop cards; `compact` keeps only the number (phones). */
export function ScoreLabel({ score, compact = false }: { score: number | null; compact?: boolean }) {
  const shown = shownScore(score);
  if (shown === null) return null;
  const value = Math.round(shown);
  const tier = TIERS.find((t) => value >= t.min)!;
  return (
    <span
      title={`AI 评分 ${value}/100`}
      aria-label={`AI 评分 ${value} 分`}
      className={`inline-flex h-[20px] shrink-0 items-center gap-1.5 whitespace-nowrap ${tier.className}`}
    >
      {tier.dot && <span className="size-1.5 rounded-full bg-hot" aria-hidden="true" />}
      {!compact && <span className="text-11 font-medium leading-none text-ink-4">AI 评分</span>}
      <span className="mono text-13 font-bold leading-none tabular-nums">{value}</span>
    </span>
  );
}

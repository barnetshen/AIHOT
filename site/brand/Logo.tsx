// 站点的标志和字标：LogoMark 是图标（和 logo.svg 同一个图形），Wordmark 是图标加站名（size 是高度，单位像素），
// RingMark 是小标记，转起来就是加载动画。换成你的 Logo 时，改这里和 logo.svg、wordmark*.svg（保持同样的参数）。
import { SITE } from "../site.ts";

/** 观潮的图标：Apple 蓝底上两道潮水和一轮日头。 */
export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <rect width="512" height="512" rx="116" fill="#0071e3" />
      <path d="M118 238c46-46 92-46 138 0s92 46 138 0" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" />
      <path d="M118 322c46-46 92-46 138 0s92 46 138 0" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" opacity=".55" />
      <circle cx="352" cy="150" r="30" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.32em] font-bold leading-none tracking-[-0.02em] ${className}`} style={{ fontSize: Math.round(size * 0.86) }} aria-label={title} role="img">
      <LogoMark size={Math.round(size * 1.1)} />
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}

import type { ReactNode } from "react";

/** A small word in the accent over a heading: 关于本站, Agent 接入. */
export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-15 font-semibold text-accent ${className}`}>{children}</p>;
}

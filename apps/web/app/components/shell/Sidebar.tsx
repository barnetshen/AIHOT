import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { useChangelogSeen } from "../../lib/local-state";
import { sidebar, sidebarIsActive, type NavItem } from "./nav";
import { ThemeSwitch } from "./ThemeSwitch";
import { IconGithub } from "../icons";

/** True while the changelog has an entry newer than the one this reader last opened. */
export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !latestVersion) return false;
  return !seen || seen < latestVersion;
}

function SideLink({ item, dot }: { item: NavItem; dot: boolean }) {
  const { pathname } = useLocation();
  const isActive = sidebarIsActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      prefetch="intent"
      aria-current={isActive ? "page" : undefined}
      className={`group relative flex h-10 items-center gap-3 rounded-tile px-3 text-[14px] transition-[background-color,color,box-shadow] duration-200 ${
        isActive ? "bg-surface font-semibold text-ink shadow-[var(--shadow-card)] ring-1 ring-line-soft dark:bg-raised" : "font-medium text-ink-3 hover:bg-surface/70 hover:text-ink dark:hover:bg-raised/60"
      }`}
    >
      {isActive && <span aria-hidden="true" className="bg-brand absolute -left-4 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />}
      <span className={`flex w-5 shrink-0 justify-center transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-accent" : ""}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
      {dot && item.changelog && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-hot" aria-label="有新的更新" />}
    </Link>
  );
}

export function Sidebar({ changelogVersion }: { changelogVersion: string | null }) {
  const dot = useChangelogDot(changelogVersion);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-line-soft bg-sidebar px-4 pb-4 pt-6 lg:flex">
      <Link to="/" className="mb-3 flex h-[50px] items-center gap-2 px-2 text-ink" aria-label={`${SITE.name} 首页`}>
        <Wordmark size={26} />
      </Link>
      <p className="mb-2 flex items-center gap-1.5 px-2 text-[11.5px] text-ink-4">
        <span aria-hidden="true" className="relative flex size-1.5">
          <span className="bg-brand absolute inset-0 animate-ping rounded-full opacity-60" />
          <span className="bg-brand relative size-1.5 rounded-full" />
        </span>
        {SITE.tagline}
      </p>
      <nav className="scrollbar-thin -mx-4 flex-1 overflow-y-auto px-4" aria-label="主导航">
        {sidebar().map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold tracking-[0.08em] text-ink-4">{section.title}</div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <SideLink key={item.to} item={item} dot={dot} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-2 space-y-2.5 px-1 pt-1">
        {SITE.github && (
          <a
            href={SITE.github}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-1 flex h-[34px] items-center justify-center gap-1.5 rounded-full border border-line text-[12.5px] text-ink-3 transition-colors hover:bg-bg-sunk hover:text-ink"
          >
            <IconGithub size={14} />
            GitHub 开源
          </a>
        )}
        <ThemeSwitch className="mx-1" />
        {SITE.icp && (
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="block px-2 text-[10px] text-ink-4 hover:text-ink-3">
            {SITE.icp}
          </a>
        )}
      </div>
    </aside>
  );
}

// The broadcasts on the web: a tab of the phone tab bar, an entry in the sidebar's 内容, and a floating
// card on the home page and the report pages (web/bubble.tsx).
import type { SVGProps } from "react";
import { defineWebModule } from "@aihot/web/modules";
import { VideoBubble } from "./web/bubble.tsx";

function IconVideo({ size = 18, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M10.5 9.5v5l4.2-2.5z" />
    </svg>
  );
}

export default defineWebModule({
  name: "report-videos",
  sidebar: { section: "内容", items: [{ to: "/videos", label: "视频播报", icon: IconVideo }] },
  tabs: [{ key: "videos", to: "/videos", label: "视频", icon: IconVideo }],
  root: { Top: VideoBubble },
});

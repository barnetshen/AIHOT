// One 1080×1920 picture per scene, for phones held upright. The same pipeline as the share cards
// (media/og.ts): satori lays the text out in Noto Sans SC as paths, sharp rasterises it, so no system
// fonts are needed. Frames are truecolour PNG: the share cards' palette dithering turns into noise once
// the video is encoded.
import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import { renderSVG } from "uqr";
import { EDITION_WHEN, SITE, subjectAfter } from "@aihot/site";
import { REPO_ROOT } from "@aihot/backend/config";
import { brandMark, h, nameMark, SITE_HOST, type Node } from "@aihot/backend/media/og";
import { issueName, type Entry, type Scene } from "./scenes.ts";

export const WIDTH = 1080;
export const HEIGHT = 1920;

const BG = "#0a1012";
const INK = "#ffffff";
const SOFT = "#b1bec0";
const MUTED = "#82939a";
const ACCENT = "#2ce2e8";
const LINE = "rgba(230,237,237,0.14)";

let fontsPromise: Promise<Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }>> | null = null;

function fonts() {
  fontsPromise ??= Promise.all([
    readFile(path.join(REPO_ROOT, "assets/og-fonts/noto-sans-sc-400.ttf")),
    readFile(path.join(REPO_ROOT, "assets/og-fonts/noto-sans-sc-700.ttf")),
  ]).then(([regular, bold]) => [
    { name: "Noto Sans SC", data: regular, weight: 400, style: "normal" },
    { name: "Noto Sans SC", data: bold, weight: 700, style: "normal" },
  ]);
  return fontsPromise;
}

const text = (style: Record<string, unknown>, children: string) => h("div", { display: "flex", ...style }, children);
const len = (s: string) => [...s].length;

function frame(children: Array<Node | null>): Node {
  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      flexDirection: "column",
      padding: "120px 88px 110px",
      fontFamily: "Noto Sans SC",
      color: INK,
      backgroundColor: BG,
      backgroundImage: "radial-gradient(circle at 92% 6%, rgba(44,226,232,0.26), rgba(10,16,18,0) 42%), radial-gradient(circle at 0% 100%, rgba(23,107,117,0.38), rgba(10,16,18,0) 48%)",
    },
    children.filter(Boolean),
  );
}

/** The header's height, fixed: the video box is placed under it. */
const HEADER = 72;

async function header(right: string): Promise<Node> {
  return h("div", { display: "flex", height: HEADER, alignItems: "center", justifyContent: "space-between" }, [
    (await brandMark("wordmark-dark.svg", 52)) ?? nameMark(44, INK, ACCENT),
    text({ fontSize: 32, color: MUTED }, right),
  ]);
}

const kicker = (label: string) =>
  h("div", { display: "flex", alignItems: "center" }, [
    h("div", { width: 14, height: 14, borderRadius: 999, backgroundColor: ACCENT, marginRight: 18 }),
    text({ fontSize: 36, fontWeight: 700, color: ACCENT, letterSpacing: 2 }, label),
  ]);

const footer = (left: Node | null) =>
  h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `2px solid ${LINE}`, paddingTop: 36 }, [
    left ?? h("div", { display: "flex" }),
    text({ fontSize: 30, color: MUTED }, SITE_HOST),
  ]);

/** Where an entry is in the video: a bar per entry, the current one lit. */
const progress = (rank: number, total: number) =>
  h("div", { display: "flex", alignItems: "center" }, Array.from({ length: total }, (_, i) =>
    h("div", { width: 34, height: 8, borderRadius: 4, marginRight: 10, backgroundColor: i + 1 === rank ? ACCENT : i + 1 < rank ? "rgba(44,226,232,0.38)" : LINE })));

/**
 * Where a screen shows the news' own video or picture: the frame leaves this box dark, and the encoder lays
 * the video over it (encode.ts) or renderFrame the picture. Right under the header, which has a fixed
 * height so the box does not move.
 */
export const CLIP_BOX = { x: 88, y: 248, width: 904, height: 508 } as const;

/** Whether a screen about a report has its box: the report's own video or picture goes in it. */
export const hasBox = (entry: Entry) => !!(entry.video || entry.image);

/** A screen about one report: what places it (`top`), its title, summary and source; its video or picture above them when it has one. */
async function news(entry: Entry, right: string, top: Node[], foot: Node | null): Promise<Node> {
  const boxed = hasBox(entry);
  const titleSize = boxed ? (len(entry.title) > 40 ? 54 : 62) : len(entry.title) > 40 ? 62 : len(entry.title) > 24 ? 70 : 80;
  const others = entry.others > 1 ? `另有 ${entry.others - 1} 个来源报道` : null;
  return frame([
    await header(right),
    boxed ? h("div", { display: "flex", marginTop: CLIP_BOX.y - 120 - HEADER, width: CLIP_BOX.width, height: CLIP_BOX.height, backgroundColor: "#000000" }) : null,
    h("div", { display: "flex", alignItems: "flex-end", marginTop: boxed ? 52 : 150 }, top),
    text({ marginTop: boxed ? 36 : 64, fontSize: titleSize, fontWeight: 700, lineHeight: 1.32 }, entry.title),
    entry.summary ? text({ marginTop: boxed ? 28 : 48, fontSize: boxed ? 38 : 42, lineHeight: 1.65, color: SOFT }, entry.summary) : null,
    h("div", { display: "flex", alignItems: "center", marginTop: boxed ? 32 : 56, fontSize: 32, color: MUTED }, [
      text({}, `来源：${entry.source}`),
      entry.firstParty ? text({ marginLeft: 18, padding: "4px 16px", borderRadius: 8, backgroundColor: "rgba(44,226,232,0.14)", color: ACCENT, fontSize: 28 }, "一手") : null,
      others ? text({ marginLeft: 24 }, `· ${others}`) : null,
    ].filter(Boolean)),
    h("div", { display: "flex", flex: 1 }),
    footer(foot),
  ]);
}

async function tree(scene: Scene): Promise<Node> {
  switch (scene.type) {
    case "cover": {
      const headline = scene.headline;
      return frame([
        await header(`第 ${scene.issueNumber} 期`),
        h("div", { display: "flex", flexDirection: "column", marginTop: 220 }, [
          text({ fontSize: 132, fontWeight: 700, lineHeight: 1.1, letterSpacing: 2 }, issueName(scene.kind)),
          text({ marginTop: 36, fontSize: 52, color: SOFT }, scene.period),
        ]),
        h("div", { display: "flex", flexDirection: "column", marginTop: 150 }, [
          headline ? kicker(scene.kind === "daily" ? "今日头条" : "本周主线") : null,
          headline ? text({ marginTop: 28, fontSize: len(headline) > 30 ? 60 : 70, fontWeight: 700, lineHeight: 1.32 }, headline) : null,
          scene.overview ? text({ marginTop: 36, fontSize: 38, lineHeight: 1.65, color: SOFT }, scene.overview) : null,
        ].filter(Boolean)),
        h("div", { display: "flex", flex: 1 }),
        footer(text({ fontSize: 32, color: SOFT }, `本期 ${scene.count} 条`)),
      ]);
    }
    case "entry":
      return news(scene.entry, `${issueName(scene.kind)} · ${scene.period}`, [
        text({ fontSize: hasBox(scene.entry) ? 96 : 168, fontWeight: 700, lineHeight: 1, color: ACCENT }, String(scene.rank).padStart(2, "0")),
        text({ marginLeft: 20, marginBottom: hasBox(scene.entry) ? 8 : 18, fontSize: 44, color: MUTED }, `/ ${String(scene.total).padStart(2, "0")}`),
        h("div", { display: "flex", flex: 1 }),
        text({ marginBottom: hasBox(scene.entry) ? 8 : 18, padding: "10px 28px", borderRadius: 999, border: `2px solid ${ACCENT}`, fontSize: 32, color: ACCENT }, scene.section),
      ], progress(scene.rank, scene.total));
    case "theme":
      return frame([
        await header(`${issueName(scene.kind)} · ${scene.period}`),
        h("div", { display: "flex", flexDirection: "column", marginTop: 360 }, [
          kicker(`主线 ${scene.index} / ${scene.total}`),
          text({ marginTop: 40, fontSize: 96, fontWeight: 700, lineHeight: 1.25 }, scene.heading),
          scene.summary ? text({ marginTop: 52, fontSize: 44, lineHeight: 1.7, color: SOFT }, scene.summary) : null,
        ].filter(Boolean)),
        h("div", { display: "flex", flex: 1 }),
        footer(null),
      ]);
    case "headlines":
      return frame([
        await header(`${issueName(scene.kind)} · ${scene.period}`),
        h("div", { display: "flex", marginTop: 170 }, [kicker("更多快讯")]),
        h("div", { display: "flex", flexDirection: "column", marginTop: 40 }, scene.titles.map((title, i) =>
          h("div", { display: "flex", padding: "34px 0", borderBottom: `2px solid ${LINE}` }, [
            text({ width: 70, fontSize: 40, fontWeight: 700, color: ACCENT }, String(i + 1)),
            text({ flex: 1, fontSize: 44, lineHeight: 1.45 }, title),
          ]))),
        h("div", { display: "flex", flex: 1 }),
        footer(null),
      ]);
    case "outro": {
      const qr = `data:image/svg+xml;base64,${Buffer.from(renderSVG(scene.url, { border: 0, ecc: "M", blackColor: "#0e191b", whiteColor: "#ffffff" })).toString("base64")}`;
      return frame([
        await header(SITE.tagline),
        h("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 300 }, [
          text({ fontSize: 76, fontWeight: 700 }, subjectAfter("看完整", scene.kind === "daily" ? "日报" : "周报")),
          text({ marginTop: 28, fontSize: 40, color: SOFT }, "每条都附原文链接"),
          h("div", { display: "flex", marginTop: 90, padding: 40, borderRadius: 40, backgroundColor: "#ffffff" }, [
            h("img", { width: 420, height: 420 }, undefined, { src: qr, width: 420, height: 420 }),
          ]),
          text({ marginTop: 60, fontSize: 44, fontWeight: 700, color: ACCENT }, SITE_HOST),
          text({ marginTop: 24, fontSize: 36, color: MUTED }, `${scene.kind === "daily" ? EDITION_WHEN.daily : EDITION_WHEN.weekly} 更新`),
        ]),
        h("div", { display: "flex", flex: 1 }),
      ]);
    }
  }
}

/** PNG bytes of a scene, with `picture` (CLIP_BOX's size) laid in its box. */
export async function renderFrame(scene: Scene, picture: Buffer | null = null): Promise<Buffer> {
  const svg = await satori(await tree(scene) as never, { width: WIDTH, height: HEIGHT, fonts: await fonts() });
  const frame = sharp(Buffer.from(svg));
  if (picture) frame.composite([{ input: picture, left: CLIP_BOX.x, top: CLIP_BOX.y }]);
  return frame.png({ compressionLevel: 3 }).toBuffer();
}

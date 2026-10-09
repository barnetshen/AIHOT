// The pictures of a scene, 1080×1920 for phones held upright: a still base (background, header, footer,
// the story bar) and the layers that come in one after another once the screen has faded in (encode.ts
// moves them). Each is drawn by the same pipeline as the share cards (media/og.ts): satori lays the text
// out in Noto Sans SC as paths, sharp rasterises it, so no system fonts are needed. A layer is the whole
// screen drawn with only its own part showing, trimmed to that part, so it lands exactly where the
// layout put it. Frames are truecolour PNG: the share cards' palette dithering turns into noise once
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
export const ACCENT = "#2ce2e8";
const LINE = "rgba(230,237,237,0.16)";
const DONE = "rgba(44,226,232,0.45)";

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

/**
 * Which picture of a screen is being drawn: its still base, or one of its layers by number. Every drawing
 * lays out the whole screen, so each part sits where it does in the others; the ones not in this
 * picture are drawn transparent.
 */
class Pass {
  /** The highest layer number the screen uses. */
  layers = 0;
  readonly which: "base" | number;
  constructor(which: "base" | number) {
    this.which = which;
  }
  /** A part of the base. */
  still(node: Node): Node {
    return this.which === "base" ? node : fade(node);
  }
  /** A part that comes in as layer `n`. */
  layer(n: number, node: Node): Node {
    this.layers = Math.max(this.layers, n);
    return this.which === n ? node : fade(node);
  }
}

const fade = (node: Node): Node => ({ ...node, props: { ...node.props, style: { ...node.props.style, opacity: 0 } } });
const text = (style: Record<string, unknown>, children: string) => h("div", { display: "flex", ...style }, children);
const len = (s: string) => [...s].length;

function frame(pass: Pass, children: Array<Node | null>): Node {
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
      position: "relative",
      // Layers are transparent around their part.
      ...(pass.which === "base" ? {
        backgroundColor: BG,
        backgroundImage: "radial-gradient(circle at 92% 6%, rgba(44,226,232,0.26), rgba(10,16,18,0) 42%), radial-gradient(circle at 0% 100%, rgba(23,107,117,0.38), rgba(10,16,18,0) 48%)",
      } : {}),
    },
    children.filter(Boolean),
  );
}

/** The header's height, fixed: the video box is placed under it. */
const HEADER = 72;

async function header(pass: Pass, right: string): Promise<Node> {
  return pass.still(h("div", { display: "flex", height: HEADER, alignItems: "center", justifyContent: "space-between" }, [
    (await brandMark("wordmark-dark.svg", 52)) ?? nameMark(44, INK, ACCENT),
    text({ fontSize: 32, color: MUTED }, right),
  ]));
}

const kicker = (label: string) =>
  h("div", { display: "flex", alignItems: "center" }, [
    h("div", { width: 14, height: 14, borderRadius: 999, backgroundColor: ACCENT, marginRight: 18 }),
    text({ fontSize: 36, fontWeight: 700, color: ACCENT, letterSpacing: 2 }, label),
  ]);

const footer = (pass: Pass, left: Node | null) =>
  pass.still(h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `2px solid ${LINE}`, paddingTop: 36 }, [
    left ?? h("div", { display: "flex" }),
    text({ fontSize: 30, color: MUTED }, SITE_HOST),
  ]));

/**
 * The story bar across the top: a segment per entry, the ones told lit, the current one's track filled
 * by the encoder as it is read.
 */
const STORY = { x: 88, y: 60, width: 904, height: 6, gap: 10 } as const;
export type Segment = { x: number; y: number; width: number; height: number };

function storySegment(rank: number, total: number): Segment {
  const width = (STORY.width - STORY.gap * (total - 1)) / total;
  return { x: Math.round(STORY.x + (rank - 1) * (width + STORY.gap)), y: STORY.y, width: Math.round(width), height: STORY.height };
}

const storyBar = (pass: Pass, rank: number, total: number) =>
  pass.still(h("div", { display: "flex", position: "absolute", left: STORY.x, top: STORY.y, width: STORY.width, height: STORY.height }, Array.from({ length: total }, (_, i) =>
    h("div", { flex: 1, height: STORY.height, borderRadius: 3, marginLeft: i ? STORY.gap : 0, backgroundColor: i + 1 < rank ? DONE : LINE }))));

/**
 * Where a screen shows the news' own video or picture: the base leaves this box dark and the encoder lays
 * the video or the picture over it. Right under the header, which has a fixed height so the box does not move.
 */
export const CLIP_BOX = { x: 88, y: 248, width: 904, height: 508 } as const;

/** Whether a screen about a report has its box: the report's own video or picture goes in it. */
export const hasBox = (entry: Entry) => !!(entry.video || entry.image);

/** A screen about one report: what places it (`top`), its title, summary and source; its video or picture above them when it has one. */
async function news(pass: Pass, entry: Entry, right: string, top: Node[]): Promise<Node> {
  const boxed = hasBox(entry);
  const titleSize = boxed ? (len(entry.title) > 40 ? 54 : 62) : len(entry.title) > 40 ? 62 : len(entry.title) > 24 ? 70 : 80;
  const others = entry.others > 1 ? `另有 ${entry.others - 1} 个来源报道` : null;
  return frame(pass, [
    await header(pass, right),
    boxed ? pass.still(h("div", { display: "flex", marginTop: CLIP_BOX.y - 120 - HEADER, width: CLIP_BOX.width, height: CLIP_BOX.height, borderRadius: 4, backgroundColor: "#000000" })) : null,
    pass.layer(1, h("div", { display: "flex", alignItems: "flex-end", marginTop: boxed ? 52 : 150 }, top)),
    pass.layer(2, text({ marginTop: boxed ? 36 : 64, fontSize: titleSize, fontWeight: 700, lineHeight: 1.32 }, entry.title)),
    entry.summary ? pass.layer(3, text({ marginTop: boxed ? 28 : 48, fontSize: boxed ? 38 : 42, lineHeight: 1.65, color: SOFT }, entry.summary)) : null,
    pass.layer(4, h("div", { display: "flex", alignItems: "center", marginTop: boxed ? 32 : 56, fontSize: 32, color: MUTED }, [
      text({}, `来源：${entry.source}`),
      entry.firstParty ? text({ marginLeft: 18, padding: "4px 16px", borderRadius: 8, backgroundColor: "rgba(44,226,232,0.14)", color: ACCENT, fontSize: 28 }, "一手") : null,
      others ? text({ marginLeft: 24 }, `· ${others}`) : null,
    ].filter(Boolean))),
    h("div", { display: "flex", flex: 1 }),
    footer(pass, null),
  ]);
}

async function tree(scene: Scene, pass: Pass): Promise<Node> {
  switch (scene.type) {
    case "cover": {
      const headline = scene.headline;
      return frame(pass, [
        await header(pass, `第 ${scene.issueNumber} 期`),
        pass.layer(1, h("div", { display: "flex", flexDirection: "column", marginTop: 220 }, [
          text({ fontSize: 132, fontWeight: 700, lineHeight: 1.1, letterSpacing: 2 }, issueName(scene.kind)),
          text({ marginTop: 36, fontSize: 52, color: SOFT }, scene.period),
        ])),
        h("div", { display: "flex", flexDirection: "column", marginTop: 150 }, [
          headline ? pass.layer(2, kicker(scene.kind === "daily" ? "今日头条" : "本周主线")) : null,
          headline ? pass.layer(3, text({ marginTop: 28, fontSize: len(headline) > 30 ? 60 : 70, fontWeight: 700, lineHeight: 1.32 }, headline)) : null,
          scene.overview ? pass.layer(4, text({ marginTop: 36, fontSize: 38, lineHeight: 1.65, color: SOFT }, scene.overview)) : null,
        ].filter(Boolean)),
        h("div", { display: "flex", flex: 1 }),
        footer(pass, text({ fontSize: 32, color: SOFT }, `本期 ${scene.count} 条`)),
      ]);
    }
    case "entry": {
      const boxed = hasBox(scene.entry);
      return news(pass, scene.entry, `${issueName(scene.kind)} · ${scene.period}`, [
        text({ fontSize: boxed ? 96 : 168, fontWeight: 700, lineHeight: 1, color: ACCENT }, String(scene.rank).padStart(2, "0")),
        text({ marginLeft: 20, marginBottom: boxed ? 8 : 18, fontSize: 44, color: MUTED }, `/ ${String(scene.total).padStart(2, "0")}`),
        h("div", { display: "flex", flex: 1 }),
        text({ marginBottom: boxed ? 8 : 18, padding: "10px 28px", borderRadius: 999, border: `2px solid ${ACCENT}`, fontSize: 32, color: ACCENT }, scene.section),
      ]).then((node) => ({ ...node, props: { ...node.props, children: [storyBar(pass, scene.rank, scene.total), ...(node.props.children as Node[])] } }));
    }
    case "theme":
      return frame(pass, [
        await header(pass, `${issueName(scene.kind)} · ${scene.period}`),
        h("div", { display: "flex", flexDirection: "column", marginTop: 360 }, [
          pass.layer(1, kicker(`主线 ${scene.index} / ${scene.total}`)),
          pass.layer(2, text({ marginTop: 40, fontSize: 96, fontWeight: 700, lineHeight: 1.25 }, scene.heading)),
          scene.summary ? pass.layer(3, text({ marginTop: 52, fontSize: 44, lineHeight: 1.7, color: SOFT }, scene.summary)) : null,
        ].filter(Boolean)),
        h("div", { display: "flex", flex: 1 }),
        footer(pass, null),
      ]);
    case "headlines":
      return frame(pass, [
        await header(pass, `${issueName(scene.kind)} · ${scene.period}`),
        pass.layer(1, h("div", { display: "flex", marginTop: 170 }, [kicker("更多快讯")])),
        // The headlines come in one after another.
        h("div", { display: "flex", flexDirection: "column", marginTop: 40 }, scene.titles.map((title, i) =>
          pass.layer(i + 2, h("div", { display: "flex", padding: "34px 0", borderBottom: `2px solid ${LINE}` }, [
            text({ width: 70, fontSize: 40, fontWeight: 700, color: ACCENT }, String(i + 1)),
            text({ flex: 1, fontSize: 44, lineHeight: 1.45 }, title),
          ])))),
        h("div", { display: "flex", flex: 1 }),
        footer(pass, null),
      ]);
    case "outro": {
      const qr = `data:image/svg+xml;base64,${Buffer.from(renderSVG(scene.url, { border: 0, ecc: "M", blackColor: "#0e191b", whiteColor: "#ffffff" })).toString("base64")}`;
      return frame(pass, [
        await header(pass, SITE.tagline),
        h("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 300 }, [
          pass.layer(1, text({ fontSize: 76, fontWeight: 700 }, subjectAfter("看完整", scene.kind === "daily" ? "日报" : "周报"))),
          pass.layer(2, text({ marginTop: 28, fontSize: 40, color: SOFT }, "每条都附原文链接")),
          pass.layer(3, h("div", { display: "flex", marginTop: 90, padding: 40, borderRadius: 40, backgroundColor: "#ffffff" }, [
            h("img", { width: 420, height: 420 }, undefined, { src: qr, width: 420, height: 420 }),
          ])),
          pass.layer(4, h("div", { display: "flex", flexDirection: "column", alignItems: "center" }, [
            text({ marginTop: 60, fontSize: 44, fontWeight: 700, color: ACCENT }, SITE_HOST),
            text({ marginTop: 24, fontSize: 36, color: MUTED }, `${scene.kind === "daily" ? EDITION_WHEN.daily : EDITION_WHEN.weekly} 更新`),
          ])),
        ]),
        h("div", { display: "flex", flex: 1 }),
      ]);
    }
  }
}

async function draw(scene: Scene, pass: Pass): Promise<Buffer> {
  const svg = await satori(await tree(scene, pass) as never, { width: WIDTH, height: HEIGHT, fonts: await fonts() });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 3 }).toBuffer();
}

export interface Layer {
  png: Buffer;
  /** Where its top left corner sits on the screen. */
  x: number;
  y: number;
}

export interface Screen {
  base: Buffer;
  /** In the order they come in. */
  layers: Layer[];
  /** The story bar's segment the encoder fills while the screen is read (screens about an entry). */
  story: Segment | null;
}

/** A scene's base and layers. */
export async function renderScreen(scene: Scene): Promise<Screen> {
  const first = new Pass("base");
  const base = await draw(scene, first);
  const layers: Layer[] = [];
  for (let n = 1; n <= first.layers; n++) {
    const full = await draw(scene, new Pass(n));
    // Trimmed to its part: the encoder moves far fewer pixels. A layer with nothing drawn is left out.
    const { data, info } = await sharp(full).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 }).png().toBuffer({ resolveWithObject: true })
      .catch(() => ({ data: null, info: null }));
    if (!data || !info) continue;
    layers.push({ png: data, x: -(info.trimOffsetLeft ?? 0), y: -(info.trimOffsetTop ?? 0) });
  }
  return { base, layers, story: scene.type === "entry" ? storySegment(scene.rank, scene.total) : null };
}

/** The screen as it looks once everything has come in (posters and tests). */
export async function renderStill(scene: Scene): Promise<Buffer> {
  const { base, layers } = await renderScreen(scene);
  return sharp(base).composite(layers.map((l) => ({ input: l.png, left: l.x, top: l.y }))).png().toBuffer();
}

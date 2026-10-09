// Screens to an H.264 MP4 with ffmpeg. Each screen is its still base with its parts coming in once it
// has faded in: one after another, each rising a little as it fades in and easing to rest. A screen's
// own video plays in its box (frames.ts CLIP_BOX) from then on, looped when shorter and without its
// sound; a picture there drifts slowly across, as a camera would pan over it. The story bar's current
// segment fills while the screen is read (drawbox sizes are fixed, so a lit bar slides in under a window). Screens cross-fade; each one's narration starts once it has
// faded in, on one AAC track; and the index is at the front of the file so players start before it
// has all arrived.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ACCENT, CLIP_BOX, type Segment } from "./frames.ts";

const run = promisify(execFile);

const FPS = 30;
/** Seconds two scenes overlap while one fades into the next. */
export const FADE = 0.5;
/** A part's entrance: how long it takes, how far it rises, and how long after the one before it it starts. */
const PART_IN = 0.5;
const RISE = 36;
const STAGGER = 0.12;
/** A video's or picture's fade in its box. */
const MEDIA_IN = 0.6;

/** The video's length when each screen is held for its seconds. */
export const totalSeconds = (seconds: number[]) => seconds.reduce((a, b) => a + b, 0) - FADE * Math.max(0, seconds.length - 1);

export interface Shot {
  /** The still base (PNG). */
  base: string;
  /** The parts that come in (PNG), in order, each with where it sits. */
  layers: Array<{ file: string; x: number; y: number }>;
  seconds: number;
  /** When it has faded in, from its own start: its parts, video and narration begin then. */
  enter: number;
  /** A video file to play in the screen's box. */
  clip?: string | null;
  /** A picture (PNG) a little larger than the box, which drifts across it; `reverse` drifts the other way. */
  picture?: { file: string; reverse: boolean } | null;
  /** The story bar's segment to fill. */
  story?: Segment | null;
  /** What is said over it (WAV). */
  speech?: string | null;
}

export async function encode(shots: Shot[], out: string): Promise<void> {
  const inputs: string[] = [];
  const steps: string[] = [];
  const voices: string[] = [];
  let input = 0;
  let start = 0;
  // A picture's input, decoded once and repeated by the loop filter (looping the input would decode it for
  // every frame), with its own clock from the screen's start.
  const still = (file: string, frames: number) => {
    inputs.push("-framerate", String(FPS), "-i", file);
    return `[${input++}:v]loop=loop=${frames - 1}:size=1:start=0,setpts=N/${FPS}/TB`;
  };
  shots.forEach((shot, i) => {
    const frames = Math.round(shot.seconds * FPS);
    // Fading in YUV keeps each frame a third of its size in RGB.
    steps.push(`${still(shot.base, frames)},format=yuv420p[s${i}_0]`);
    let last = `[s${i}_0]`;
    let n = 0;
    const lay = (source: string, x: string | number, y: string | number) => {
      steps.push(`${last}${source}overlay=x=${x}:y=${y}:eval=frame:eof_action=repeat[s${i}_${++n}]`);
      last = `[s${i}_${n}]`;
    };
    const { x, y, width, height } = CLIP_BOX;
    if (shot.clip) {
      inputs.push("-stream_loop", "-1", "-t", shot.seconds.toFixed(3), "-i", shot.clip);
      steps.push(`[${input++}:v]setpts=PTS-STARTPTS,fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,`
        + `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuva420p,trim=end_frame=${frames},`
        + `fade=in:st=${shot.enter}:d=${MEDIA_IN}:alpha=1[m${i}]`);
      lay(`[m${i}]`, x, y);
    } else if (shot.picture) {
      const along = `min(1,t/${shot.seconds.toFixed(3)})`;
      const travel = shot.picture.reverse ? `(1-${along})` : along;
      steps.push(`${still(shot.picture.file, frames)},crop=${width}:${height}:x='(iw-ow)*${travel}':y='(ih-oh)*${travel}',`
        + `format=yuva420p,fade=in:st=${shot.enter}:d=${MEDIA_IN}:alpha=1[m${i}]`);
      lay(`[m${i}]`, x, y);
    }
    shot.layers.forEach((layer, k) => {
      const at = (shot.enter + 0.05 + k * STAGGER).toFixed(3);
      steps.push(`${still(layer.file, frames)},format=rgba,fade=in:st=${at}:d=${PART_IN}:alpha=1[l${i}_${k}]`);
      // Ease out: quick at first, settling into place.
      lay(`[l${i}_${k}]`, layer.x, `'${layer.y}+${RISE}*pow(max(0,1-max(0,t-${at})/${PART_IN}),3)'`);
    });
    if (shot.story) {
      // A bar twice the segment's width, lit on its left half, seen through a window of the segment's width
      // that slides from its clear half to its lit one while the screen is read.
      const { x: sx, y: sy, width: sw, height: sh } = shot.story;
      const reading = Math.max(1, shot.seconds - FADE - shot.enter).toFixed(3);
      steps.push(`color=c=0x${ACCENT.slice(1)}:s=${sw}x${sh}:r=${FPS}:d=${shot.seconds.toFixed(3)},format=rgba,pad=${sw * 2}:${sh}:0:0:color=black@0,`
        + `crop=${sw}:${sh}:x='${sw}*(1-min(1,max(0,t-${shot.enter})/${reading}))':y=0[f${i}]`);
      lay(`[f${i}]`, sx, sy);
    }
    steps.push(`${last}null[v${i}]`);
    if (shot.speech) {
      inputs.push("-i", shot.speech);
      const at = Math.round((start + shot.enter) * 1000);
      steps.push(`[${input++}:a]aformat=sample_rates=44100:channel_layouts=mono,adelay=delays=${at}:all=1[a${voices.length}]`);
      voices.push(`[a${voices.length}]`);
    }
    start += shot.seconds - FADE;
  });
  let last = "[v0]";
  let offset = 0;
  for (let i = 1; i < shots.length; i++) {
    offset += shots[i - 1]!.seconds - FADE;
    steps.push(`${last}[v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${i}]`);
    last = `[x${i}]`;
  }
  steps.push(`${last}null[out]`);
  if (voices.length) steps.push(`${voices.join("")}amix=inputs=${voices.length}:normalize=0:duration=longest,apad[speech]`);
  const length = totalSeconds(shots.map((s) => s.seconds)).toFixed(3);
  await run("ffmpeg", [
    "-y", "-nostdin", "-loglevel", "error", ...inputs,
    "-filter_complex", steps.join(";"), "-map", "[out]",
    ...(voices.length ? ["-map", "[speech]", "-c:a", "aac", "-b:a", "96k"] : ["-an"]),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-r", String(FPS),
    "-t", length, "-movflags", "+faststart", out,
  ], { maxBuffer: 4 * 1024 * 1024 });
}

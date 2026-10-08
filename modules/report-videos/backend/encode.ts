// Frames to an H.264 MP4 with ffmpeg: each picture held for its seconds, a screen's own video played in
// its box (frames.ts CLIP_BOX) from the start, looped when shorter and without its sound; a short
// cross-fade between screens; each screen's narration once it has faded in, on one AAC track; and the
// index at the front of the file so players start before it has all arrived.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLIP_BOX } from "./frames.ts";

const run = promisify(execFile);

const FPS = 30;
/** Seconds two scenes overlap while one fades into the next. */
export const FADE = 0.5;

/** The video's length when each frame is held for its seconds. */
export const totalSeconds = (seconds: number[]) => seconds.reduce((a, b) => a + b, 0) - FADE * Math.max(0, seconds.length - 1);

export interface Shot {
  /** The screen as a PNG. */
  file: string;
  seconds: number;
  /** A video file to play in the screen's box. */
  clip?: string | null;
  /** What is said over it (WAV), from when it has faded in. */
  speech?: string | null;
}

export async function encode(shots: Shot[], out: string): Promise<void> {
  const inputs: string[] = [];
  const steps: string[] = [];
  const voices: string[] = [];
  let input = 0;
  let start = 0;
  shots.forEach((shot, i) => {
    const frames = Math.round(shot.seconds * FPS);
    inputs.push("-framerate", String(FPS), "-i", shot.file);
    // Each picture is decoded once and repeated by the loop filter (looping the input would decode it for
    // every frame), in YUV, which keeps each frame a third of its size in RGB.
    const still = `[${input++}:v]format=yuv420p,loop=loop=${frames - 1}:size=1:start=0,setpts=N/${FPS}/TB`;
    if (!shot.clip) steps.push(`${still}[v${i}]`);
    else {
      inputs.push("-stream_loop", "-1", "-t", shot.seconds.toFixed(3), "-i", shot.clip);
      const { x, y, width, height } = CLIP_BOX;
      steps.push(`${still}[s${i}]`);
      steps.push(`[${input++}:v]setpts=PTS-STARTPTS,fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,`
        + `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p,trim=end_frame=${frames}[c${i}]`);
      steps.push(`[s${i}][c${i}]overlay=${x}:${y}:eof_action=repeat[v${i}]`);
    }
    if (shot.speech) {
      inputs.push("-i", shot.speech);
      const at = Math.round((start + (i ? FADE : 0)) * 1000);
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
    // Pictures alone compress best tuned for stills; a screen's video needs the default tuning.
    "-c:v", "libx264", "-preset", "veryfast", ...(shots.some((s) => s.clip) ? [] : ["-tune", "stillimage"]), "-crf", "22", "-r", String(FPS),
    "-t", length, "-movflags", "+faststart", out,
  ], { maxBuffer: 4 * 1024 * 1024 });
}

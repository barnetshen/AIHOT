// The anchor's voice: MeloTTS (MIT licence), a Chinese and English model run on this machine with
// sherpa-onnx, so reading a broadcast aloud costs nothing and calls no outside service. The model is
// fetched once into voice/ (scripts/fetch-voice.ts; the Docker image does it when it is built). Speech
// is synthesised in a child process (speak.ts): synthesis blocks its thread, and the worker's other jobs
// keep running meanwhile.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";

export const VOICE = "vits-melo-tts-zh_en";
export const VOICE_DIR = path.join(REPO_ROOT, "modules/report-videos/voice", VOICE);
export const VOICE_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${VOICE}.tar.bz2`;
const SPEAK = path.join(import.meta.dirname, "speak.ts");

export interface Line {
  text: string;
  /** The WAV file it is read into. */
  file: string;
}

/** Reads each line into its WAV file; the lengths in seconds. Tests put a voice of their own here. */
export const voice = { speak: speakWithModel };

function speakWithModel(lines: Line[]): Promise<number[]> {
  if (!existsSync(path.join(VOICE_DIR, "model.onnx"))) {
    return Promise.reject(new Error(`no voice model in ${VOICE_DIR}: run node modules/report-videos/scripts/fetch-voice.ts`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SPEAK, VOICE_DIR], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    // The model names every character it cannot read; only the end matters when it fails.
    child.stderr.on("data", (chunk: Buffer) => (err = (err + chunk).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(JSON.parse(out) as number[]);
      else reject(new Error(`speech synthesis failed (${code}): ${err.trim()}`));
    });
    child.stdin.end(JSON.stringify(lines));
  });
}

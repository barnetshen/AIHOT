// Fetches the broadcast voice (backend/voice.ts) into modules/report-videos/voice/, once; the Docker image
// runs it when it is built. Without Docker, run it after npm ci:  node modules/report-videos/scripts/fetch-voice.ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { VOICE, VOICE_DIR, VOICE_URL } from "../backend/voice.ts";

if (existsSync(path.join(VOICE_DIR, "model.onnx"))) {
  console.log(`${VOICE} 已经在 ${VOICE_DIR}`);
  process.exit(0);
}
const parent = path.dirname(VOICE_DIR);
mkdirSync(parent, { recursive: true });
console.log(`下载 ${VOICE_URL}（约 170 MB）…`);
const res = await fetch(VOICE_URL);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const archive = path.join(parent, `${VOICE}.tar.bz2`);
writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
execFileSync("tar", ["xjf", archive, "-C", parent]);
rmSync(archive);
console.log(`已放到 ${VOICE_DIR}`);

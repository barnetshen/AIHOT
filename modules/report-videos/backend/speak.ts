// Reads lines aloud with the voice model in the folder given as its argument: [{ text, file }] on stdin,
// one WAV file each, their lengths in seconds as JSON on stdout (voice.ts).
import { availableParallelism } from "node:os";
import sherpa from "sherpa-onnx-node";

const dir = process.argv[2]!;
let input = "";
for await (const chunk of process.stdin) input += chunk;
const lines = JSON.parse(input) as Array<{ text: string; file: string }>;
const tts = new sherpa.OfflineTts({
  model: {
    vits: { model: `${dir}/model.onnx`, lexicon: `${dir}/lexicon.txt`, tokens: `${dir}/tokens.txt`, dictDir: `${dir}/dict` },
    numThreads: Math.min(4, availableParallelism()),
    provider: "cpu",
  },
  // Dates, phone numbers, numbers and words read more than one way.
  ruleFsts: ["date", "phone", "number", "new_heteronym"].map((f) => `${dir}/${f}.fst`).join(","),
  maxNumSentences: 1,
});
const seconds = lines.map(({ text, file }) => {
  // A news reader's pace, a little quicker than the model's own.
  const audio = tts.generate({ text, sid: 0, speed: 1.05 });
  sherpa.writeWave(file, { samples: audio.samples, sampleRate: audio.sampleRate });
  return audio.samples.length / audio.sampleRate;
});
process.stdout.write(JSON.stringify(seconds));

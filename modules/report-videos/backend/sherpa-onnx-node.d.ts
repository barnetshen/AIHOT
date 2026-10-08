// The part of sherpa-onnx-node that speak.ts uses; the package ships no types.
declare module "sherpa-onnx-node" {
  interface Audio {
    samples: Float32Array;
    sampleRate: number;
  }
  class OfflineTts {
    constructor(config: Record<string, unknown>);
    generate(request: { text: string; sid: number; speed: number }): Audio;
  }
  function writeWave(file: string, audio: Audio): void;
  const sherpa: { OfflineTts: typeof OfflineTts; writeWave: typeof writeWave };
  export default sherpa;
}

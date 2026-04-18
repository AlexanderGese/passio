/**
 * Play a base64 audio clip with Web Audio, driving a per-frame amplitude
 * value via `onLevel`. Returns a promise that resolves when playback
 * finishes. Smooths the raw RMS so the mouth doesn't strobe.
 */
export async function playWithLipsync(opts: {
  base64: string;
  mimeType: string;
  onLevel: (level: number) => void;
  onDone?: () => void;
}): Promise<void> {
  const bytes = base64ToBytes(opts.base64);
  const ctx = new AudioContext();
  // Allocate a fresh ArrayBuffer so the type is strictly ArrayBuffer (not
  // ArrayBuffer | SharedArrayBuffer, which decodeAudioData rejects in TS).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const buf = await ctx.decodeAudioData(ab);

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const data = new Uint8Array(analyser.frequencyBinCount);

  src.connect(analyser);
  analyser.connect(ctx.destination);

  let smooth = 0;
  const DECAY = 0.75;
  let rafId = 0;
  function tick() {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) {
      const n = (v - 128) / 128;
      sum += n * n;
    }
    const rms = Math.sqrt(sum / data.length);
    // Boost — TTS RMS tends to sit around 0.05-0.2
    const boosted = Math.min(1, rms * 3.2);
    smooth = smooth * DECAY + boosted * (1 - DECAY);
    opts.onLevel(smooth);
    rafId = requestAnimationFrame(tick);
  }

  return new Promise<void>((resolve) => {
    src.onended = () => {
      cancelAnimationFrame(rafId);
      opts.onLevel(0);
      void ctx.close();
      opts.onDone?.();
      resolve();
    };
    src.start();
    tick();
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

import type { AmbientAudioPreset } from '../types/studio';

export interface ActiveAmbientTrack {
  audioTrack: MediaStreamTrack | null;
  stop: () => void;
}

/**
 * Synthesizes a $0 procedural cinema soundscape using Web Audio API and routes it into
 * a MediaStreamTrack so MediaRecorder muxes real synchronized ambient audio directly
 * into exported storyboard videos with zero external servers or copyright risk.
 */
export function startProceduralAmbientAudio(preset: AmbientAudioPreset): ActiveAmbientTrack {
  if (preset === 'none' || typeof window === 'undefined') {
    return { audioTrack: null, stop: () => {} };
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { audioTrack: null, stop: () => {} };
  }

  try {
    const ctx = new AudioCtx();
    const dest = ctx.createMediaStreamDestination();
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(dest);

    const stopCallbacks: (() => void)[] = [];

    if (preset === 'tropical-rain') {
      // Filtered pink-ish noise bed for soft cinema rain
      const bufferSize = ctx.sampleRate * 3;
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.02) * 0.65;
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 950;
      filter.Q.value = 0.6;

      src.connect(filter);
      filter.connect(master);
      src.start();
      stopCallbacks.push(() => {
        try {
          src.stop();
        } catch {
          // ignore
        }
      });
    } else if (preset === 'neon-drone') {
      // Deep cyberpunk fifth-interval synth drone
      const freqs = [65.41, 98.0, 130.81];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.connect(master);

      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.25;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        stopCallbacks.push(() => {
          try {
            osc.stop();
          } catch {
            // ignore
          }
        });
      }
    } else if (preset === 'warm-cinema') {
      // Lush major-7th cinema score pad (C3, G3, B3, E4)
      const freqs = [130.81, 196.0, 246.94, 329.63];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 680;
      filter.connect(master);

      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.22;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        stopCallbacks.push(() => {
          try {
            osc.stop();
          } catch {
            // ignore
          }
        });
      }
    }

    const track = dest.stream.getAudioTracks()[0] ?? null;
    return {
      audioTrack: track,
      stop: () => {
        for (const fn of stopCallbacks) fn();
        void ctx.close().catch(() => {});
      },
    };
  } catch {
    return { audioTrack: null, stop: () => {} };
  }
}

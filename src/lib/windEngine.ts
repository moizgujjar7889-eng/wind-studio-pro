import type { WindEngineStatus } from './types';

type Listener = (level: number, status: WindEngineStatus) => void;

/** Wind levels below this are treated as exactly 0 everywhere (cloth + particles). */
export const WIND_MIN = 0.03;

// ---- blow detector tuning ------------------------------------------------------------------
// A real blow into a phone mic is loud, noise-like (no harmonics) and heavy in the low band
// (rumble, < ~600 Hz). Speech is harmonic, a clap/tap is short, room noise is quiet.
const WARMUP_MS = 800; // gate stays closed while the room noise floor is measured
const OPEN = 0.2; // raw level needed to open the gate
const CLOSE = 0.09; // raw level below which the gate starts to close
const Q_OPEN = 0.3; // "blow-likeness" (0..1) needed to open
const Q_KEEP = 0.12; // blow-likeness needed to stay open
const OPEN_MS = 90; // must be blow-like this long before wind starts (rejects clicks / taps)
const CLOSE_MS = 120; // must be quiet / not blow-like this long before wind stops
const LOW_HI_HZ = 600; // low band: 60 .. 600 Hz
const TOP_HZ = 6000;

/**
 * Microphone → wind level engine.
 * The level is exactly 0 unless the user is really blowing: noise, talking, clicks and tiny puffs
 * keep the gate closed. Fast attack, slower release for a natural gust feel.
 */
export class WindEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Float32Array<ArrayBuffer> | null = null;
  private freq: Float32Array<ArrayBuffer> | null = null;
  private raf = 0;
  private listener: Listener | null = null;
  private noiseFloor = 0.012;
  private startedAt = 0;
  private lastTick = 0;
  private smoothed = 0;
  private peakHold = 0;
  private gateOpen = false;
  private openSince = 0; // time the blow-like condition started (0 = not running)
  private closeSince = 0; // time the quiet condition started (0 = not running)
  private status: WindEngineStatus = {
    phase: 'idle',
    level: 0,
    peak: 0,
    message: null,
  };

  onWind(listener: Listener) {
    this.listener = listener;
  }

  async start(): Promise<void> {
    if (this.ctx) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (e) {
      this.status = {
        phase: 'error',
        level: 0,
        peak: 0,
        message: 'Microphone permission denied',
      };
      this.listener?.(0, this.status);
      throw e;
    }

    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined);
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.35;
    source.connect(this.analyser);

    this.timeData = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
    this.noiseFloor = 0.012;
    this.smoothed = 0;
    this.peakHold = 0;
    this.gateOpen = false;
    this.openSince = 0;
    this.closeSince = 0;
    this.status = { phase: 'listening', level: 0, peak: 0, message: null };
    this.tick();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.timeData = null;
    this.freq = null;
    this.smoothed = 0;
    this.peakHold = 0;
    this.gateOpen = false;
    this.status = { phase: 'idle', level: 0, peak: 0, message: null };
    this.listener?.(0, this.status);
  }

  dispose() {
    this.stop();
    this.listener = null;
  }

  private emit(level: number) {
    this.status = { phase: 'listening', level, peak: this.peakHold, message: null };
    this.listener?.(level, this.status);
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.analyser || !this.timeData || !this.freq || !this.ctx) return;

    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTick) / 1000));
    this.lastTick = now;

    // Mic unplugged / permission revoked: report it and make sure no wind stays behind.
    const tracks = this.stream?.getAudioTracks() ?? [];
    if (tracks.length === 0 || tracks.every((t) => t.readyState === 'ended')) {
      this.stop();
      this.status = { phase: 'error', level: 0, peak: 0, message: 'Microphone disconnected' };
      this.listener?.(0, this.status);
      return;
    }
    // Suspended audio context (tab in background, phone call): the analyser data is stale -> no wind.
    if (this.ctx.state !== 'running') {
      this.gateOpen = false;
      this.openSince = 0;
      this.closeSince = 0;
      this.smoothed = 0;
      this.peakHold = 0;
      this.emit(0);
      void this.ctx.resume().catch(() => undefined);
      return;
    }

    this.analyser.getFloatTimeDomainData(this.timeData);
    this.analyser.getFloatFrequencyData(this.freq);

    // RMS
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);

    // Spectrum: how noise-like and how low-heavy is the sound?
    // Bin width is sampleRate / fftSize (frequencyBinCount = fftSize / 2 bins cover 0 .. Nyquist).
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    let lowPow = 0;
    let highPow = 0;
    let lowLog = 0;
    let lowBins = 0;
    for (let i = 1; i < this.freq.length; i++) {
      const hz = i * binHz;
      if (hz < 60) continue;
      if (hz > TOP_HZ) break;
      const pw = Math.pow(10, this.freq[i] / 10); // dB -> power (-Infinity -> 0)
      if (hz <= LOW_HI_HZ) {
        lowPow += pw;
        lowLog += Math.log(Math.max(pw, 1e-14));
        lowBins++;
      } else {
        highPow += pw;
      }
    }
    // Flatness of the low band: ~0.5 for turbulent noise (a blow), small for voiced speech (harmonics).
    const lowMean = lowBins > 0 ? lowPow / lowBins : 0;
    const lowFlat = lowMean > 1e-14 ? Math.min(1, Math.exp(lowLog / lowBins) / lowMean) : 0;
    const lowShare = lowPow / (lowPow + highPow + 1e-20);
    const quality =
      Math.min(1, Math.max(0, (lowFlat - 0.15) / 0.35)) * Math.min(1, Math.max(0, (lowShare - 0.45) / 0.4));

    // Level above the room noise
    const loud = Math.max(0, rms - this.noiseFloor * 1.35);
    const breath = loud * (0.15 + 1.1 * quality);
    const raw = Math.min(1, Math.pow(breath * 7.8, 0.58));

    // Gate: room noise, talking, clicks or a tiny puff must NOT move the dress.
    // Opens only after a sustained, blow-like sound; closes shortly after it stops.
    const warm = now - this.startedAt < WARMUP_MS;
    if (warm) {
      this.gateOpen = false;
      this.openSince = 0;
      this.closeSince = 0;
    } else if (!this.gateOpen) {
      if (raw > OPEN && quality >= Q_OPEN) {
        if (this.openSince === 0) this.openSince = now;
        if (now - this.openSince >= OPEN_MS) {
          this.gateOpen = true;
          this.openSince = 0;
          this.closeSince = 0;
        }
      } else {
        this.openSince = 0;
      }
    } else if (raw < CLOSE || quality < Q_KEEP) {
      if (this.closeSince === 0) this.closeSince = now;
      if (now - this.closeSince >= CLOSE_MS) {
        this.gateOpen = false;
        this.closeSince = 0;
      }
    } else {
      this.closeSince = 0;
    }
    const shaped = this.gateOpen ? raw : 0;

    // Noise floor follows the room only while nothing is blowing (never learns the blow itself).
    if (warm) {
      this.noiseFloor += (rms - this.noiseFloor) * 0.2;
    } else if (!this.gateOpen && shaped === 0) {
      this.noiseFloor += (rms - this.noiseFloor) * (rms > this.noiseFloor ? 0.004 : 0.03);
    }
    this.noiseFloor = Math.min(0.08, Math.max(0.0035, this.noiseFloor));

    this.peakHold = Math.max(this.peakHold * 0.992, shaped);

    // Fast attack, slower release (frame-rate independent)
    const tau = shaped > this.smoothed ? 0.03 : 0.12;
    this.smoothed += (shaped - this.smoothed) * (1 - Math.exp(-dt / tau));
    // Exactly 0 once the gate is closed and the tail has faded.
    if (shaped === 0 && this.smoothed < WIND_MIN) this.smoothed = 0;

    this.emit(this.smoothed);
  };
}

/**
 * Procedural demo wind when mic is not used.
 */
export class DemoWind {
  private value = 0;
  private t = Math.random() * 80;
  private raf = 0;
  private listener: Listener | null = null;
  private peak = 0;

  onWind(listener: Listener) {
    this.listener = listener;
  }

  start() {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.t += 0.016;
      // Organic multi-layer gusts
      const a = 0.52 + 0.32 * Math.sin(this.t * 0.48);
      const b = 0.5 + 0.22 * Math.sin(this.t * 1.55 + 1.1);
      const c = 0.5 + 0.12 * Math.sin(this.t * 3.6 + 3.8);
      this.value = Math.max(0, Math.min(1, a * b * c * 1.45));
      this.peak = Math.max(this.peak * 0.99, this.value);
      this.listener?.(this.value, {
        phase: 'listening',
        level: this.value,
        peak: this.peak,
        message: null,
      });
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.value = 0;
    this.peak = 0;
  }
}

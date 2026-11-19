import type { WindEngineStatus } from './types';

type Listener = (level: number, status: WindEngineStatus) => void;

/**
 * Microphone → wind level engine.
 * Strong, sustained blow produces high values.
 * Fast attack, slower release for natural gust feel.
 */
export class WindEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Float32Array | null = null;
  private freq: Float32Array | null = null;
  private raf = 0;
  private listener: Listener | null = null;
  private noiseFloor = 0.012;
  private startedAt = 0;
  private smoothed = 0;
  private peakHold = 0;
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
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.35;
    source.connect(this.analyser);

    this.timeData = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.startedAt = performance.now();
    this.noiseFloor = 0.012;
    this.smoothed = 0;
    this.peakHold = 0;
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
    this.status = { phase: 'idle', level: 0, peak: 0, message: null };
    this.listener?.(0, this.status);
  }

  dispose() {
    this.stop();
    this.listener = null;
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.analyser || !this.timeData || !this.freq || !this.ctx) return;

    this.analyser.getFloatTimeDomainData(this.timeData);
    this.analyser.getFloatFrequencyData(this.freq);

    // RMS
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);

    // Spectral energy focused on breath / wind band (80 Hz – 6 kHz)
    const sampleRate = this.ctx.sampleRate;
    const binHz = sampleRate / (this.analyser.fftSize * 2);
    let energy = 0;
    let logSum = 0;
    let bins = 0;

    for (let i = 2; i < this.freq.length; i++) {
      const hz = i * binHz;
      if (hz < 80 || hz > 6000) continue;
      const db = this.freq[i];
      const lin = Math.pow(10, db / 20);
      energy += lin * lin;
      if (lin > 1e-6) logSum += Math.log(lin * lin);
      bins++;
    }
    energy = Math.sqrt(energy / Math.max(1, bins));
    const logAvg = bins > 0 ? logSum / bins : 0;
    const flatness = energy > 1e-8 ? Math.min(1, Math.exp(logAvg) / energy) : 0;

    // Strong blow detection
    const loud = Math.max(0, rms - this.noiseFloor * 1.35);
    const breath = loud * (0.3 + 1.0 * flatness);

    // Adaptive noise floor
    if (performance.now() - this.startedAt < 1000) {
      this.noiseFloor = Math.max(this.noiseFloor, rms * 0.75);
    } else {
      this.noiseFloor = Math.max(0.0035, this.noiseFloor * 0.9985 + rms * 0.0015);
    }

    // Curve: strong blow → high values quickly
    // Power curve makes heavy blow reach near 1.0
    const shaped = Math.min(1, Math.pow(breath * 7.8, 0.58));

    this.peakHold = Math.max(this.peakHold * 0.992, shaped);

    // Fast attack, slower release
    const attack = 0.55;
    const release = 0.085;
    this.smoothed =
      shaped > this.smoothed
        ? this.smoothed + (shaped - this.smoothed) * attack
        : this.smoothed + (shaped - this.smoothed) * release;

    this.status = {
      phase: 'listening',
      level: this.smoothed,
      peak: this.peakHold,
      message: null,
    };
    this.listener?.(this.smoothed, this.status);
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

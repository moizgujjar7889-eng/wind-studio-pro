import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronUp,
  Hand,
  Mic,
  MicOff,
  RotateCcw,
  Wind,
  Palette,
} from 'lucide-react';
import type { CharacterPreset, LocationPreset } from './lib/types';
import { LOCATIONS } from './lib/locations';
import { CHARACTERS } from './lib/characters';
import { WindEngine, DemoWind } from './lib/windEngine';
import { WindScene } from './three/windScene';
import WindMeter from './components/WindMeter';
import StylePanel from './components/StylePanel';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WindScene | null>(null);
  const engineRef = useRef<WindEngine | null>(null);
  const demoRef = useRef<DemoWind | null>(null);
  const dragRef = useRef<{ x: number; active: boolean }>({ x: 0, active: false });

  const [location, setLocation] = useState<LocationPreset>(LOCATIONS.garden);
  const [character, setCharacter] = useState<CharacterPreset>(CHARACTERS[1]); // Sofia – good default
  const [listening, setListening] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [wind, setWind] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'closed' | 'style'>('closed');
  const [fps, setFps] = useState(60);
  const [manualWind, setManualWind] = useState(0);
  const [useManual, setUseManual] = useState(false);

  // Boot 3D scene
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new WindScene(mountRef.current, LOCATIONS.garden, CHARACTERS[1], {
      onFps: setFps,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setLocation(location);
  }, [location]);

  useEffect(() => {
    sceneRef.current?.setCharacter(character);
  }, [character]);

  const applyWind = useCallback((w: number) => {
    setWind(w);
    sceneRef.current?.setWind(w);
  }, []);

  useEffect(() => {
    if (listening || demoMode || useManual) return;
    applyWind(0);
  }, [listening, demoMode, useManual, applyWind]);

  useEffect(() => {
    if (!useManual) return;
    applyWind(manualWind);
  }, [manualWind, useManual, applyWind]);

  // ---- Microphone ----
  const startMic = useCallback(async () => {
    setError(null);
    demoRef.current?.stop();
    setDemoMode(false);
    setUseManual(false);

    const engine = engineRef.current ?? new WindEngine();
    engineRef.current = engine;
    engine.onWind((level, status) => {
      setWind(level);
      setPeak(status.peak);
      sceneRef.current?.setWind(level);
      if (status.phase === 'error') {
        setError(status.message);
        setListening(false);
      }
    });

    try {
      await engine.start();
      setListening(true);
    } catch {
      setError('Microphone access denied. Allow mic or use Demo / Slider.');
      setListening(false);
    }
  }, []);

  const stopMic = useCallback(() => {
    engineRef.current?.stop();
    setListening(false);
    applyWind(0);
    setPeak(0);
  }, [applyWind]);

  // ---- Demo wind ----
  const startDemo = useCallback(() => {
    stopMic();
    setUseManual(false);
    setError(null);
    const demo = demoRef.current ?? new DemoWind();
    demoRef.current = demo;
    demo.onWind((level, status) => {
      setWind(level);
      setPeak(status.peak);
      sceneRef.current?.setWind(level);
    });
    demo.start();
    setDemoMode(true);
  }, [stopMic]);

  const stopDemo = useCallback(() => {
    demoRef.current?.stop();
    setDemoMode(false);
    applyWind(0);
    setPeak(0);
  }, [applyWind]);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      demoRef.current?.stop();
    };
  }, []);

  // ---- Orbit controls ----
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || !sceneRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    dragRef.current.x = e.clientX;
    sceneRef.current.addYaw(dx * 0.007);
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    sceneRef.current?.addZoom(e.deltaY * 0.0025);
  };

  const active = listening || demoMode || useManual;

  return (
    <div className="fixed inset-0 bg-[#0a0e14] overflow-hidden font-sans no-select">
      {/* 3D canvas */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-sm font-semibold tracking-wide text-white/90 flex items-center gap-1.5">
            <Wind size={16} className="text-sky-400" />
            Wind Studio Pro
          </h1>
          <p className="text-[11px] text-white/45 mt-0.5">
            Blow on mic · Drag to orbit
          </p>
        </div>
        <div className="pointer-events-auto text-right text-[11px] text-white/40 tabular-nums">
          {fps} fps
        </div>
      </div>

      {/* Wind meter */}
      <div className="absolute top-14 left-3 right-3 z-20 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xs">
          <WindMeter level={wind} peak={peak} active={active} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="absolute top-28 left-3 right-3 z-20 flex justify-center">
          <div className="bg-rose-500/20 border border-rose-400/40 text-rose-100 text-xs px-3 py-2 rounded-lg max-w-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 px-3 bg-gradient-to-t from-black/70 via-black/40 to-transparent">
        {/* Manual slider */}
        {useManual && (
          <div className="mb-3 px-1">
            <label className="text-[11px] text-white/50 mb-1 block">
              Manual wind strength
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={manualWind}
              onChange={(e) => setManualWind(parseFloat(e.target.value))}
              className="w-full accent-sky-400 h-2"
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          {/* Mic */}
          {!listening ? (
            <button
              onClick={startMic}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium shadow-lg shadow-sky-500/25 transition"
            >
              <Mic size={18} />
              Start Mic
            </button>
          ) : (
            <button
              onClick={stopMic}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-rose-500/90 hover:bg-rose-400 text-white text-sm font-medium shadow-lg transition"
            >
              <MicOff size={18} />
              Stop Mic
            </button>
          )}

          {/* Demo */}
          {!demoMode ? (
            <button
              onClick={startDemo}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/15 transition"
            >
              <Wind size={16} />
              Demo
            </button>
          ) : (
            <button
              onClick={stopDemo}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-sm border border-amber-400/30 transition"
            >
              <RotateCcw size={16} />
              Stop Demo
            </button>
          )}

          {/* Manual toggle */}
          <button
            onClick={() => {
              if (useManual) {
                setUseManual(false);
                applyWind(0);
              } else {
                stopMic();
                stopDemo();
                setUseManual(true);
                setManualWind(0.45);
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full text-sm border transition ${
              useManual
                ? 'bg-violet-500/25 border-violet-400/40 text-violet-100'
                : 'bg-white/10 border-white/15 text-white/90 hover:bg-white/15'
            }`}
          >
            <Hand size={16} />
            Slider
          </button>

          {/* Style panel */}
          <button
            onClick={() => setPanel(panel === 'style' ? 'closed' : 'style')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/15 transition"
          >
            <Palette size={16} />
            Style
            <ChevronUp
              size={14}
              className={`transition-transform ${panel === 'style' ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <p className="text-center text-[10px] text-white/35 mt-3">
          Adult characters only · Blow harder for stronger lift
        </p>
      </div>

      {/* Style panel */}
      {panel === 'style' && (
        <StylePanel
          character={character}
          location={location}
          onCharacter={setCharacter}
          onLocation={setLocation}
          onClose={() => setPanel('closed')}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronUp,
  Hand,
  Mic,
  MicOff,
  Palette,
} from 'lucide-react';
import type { CharacterPreset, LocationPreset } from './lib/types';
import { LOCATIONS } from './lib/locations';
import { CHARACTERS, DEFAULT_CHARACTER_ID } from './lib/characters';
import { WindEngine } from './lib/windEngine';
import { WindScene } from './three/windScene';
import WindMeter from './components/WindMeter';
import StylePanel from './components/StylePanel';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WindScene | null>(null);
  const engineRef = useRef<WindEngine | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDist = useRef(0);

  const [location, setLocation] = useState<LocationPreset>(LOCATIONS.garden);
  const [character, setCharacter] = useState<CharacterPreset>(
    () => CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER_ID) ?? CHARACTERS[0],
  );
  const [loadingModel, setLoadingModel] = useState(false);
  const [listening, setListening] = useState(false);
  const [wind, setWind] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'closed' | 'style'>('closed');
  const [fps, setFps] = useState(60);
  const [manualWind, setManualWind] = useState(0);
  const [useManual, setUseManual] = useState(false);

  // Boot 3D scene
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new WindScene(mountRef.current, location, character, {
      onFps: setFps,
      onLoading: setLoadingModel,
      onError: setModelError,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (listening || useManual) return;
    applyWind(0);
  }, [listening, useManual, applyWind]);

  useEffect(() => {
    if (!useManual) return;
    applyWind(manualWind);
  }, [manualWind, useManual, applyWind]);

  // ---- Microphone ----
  const startMic = useCallback(async () => {
    setError(null);
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
      setError('Mic start nahi hua. Browser permission allow karein, HTTPS use karein, ya Slider try karein.');
      setListening(false);
    }
  }, []);

  const stopMic = useCallback(() => {
    engineRef.current?.stop();
    setListening(false);
    applyWind(0);
    setPeak(0);
  }, [applyWind]);


  // ---- Orbit (1 finger) + pinch zoom (2 fingers) ----
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !sceneRef.current) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) sceneRef.current.addZoom((pinchDist.current - d) * 0.01);
      pinchDist.current = d;
    } else {
      sceneRef.current.addYaw((cur.x - prev.x) * 0.007);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinchDist.current = 0;
  };

  // Wheel must be a non-passive native listener, otherwise preventDefault() just logs warnings.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      sceneRef.current?.addZoom(e.deltaY * 0.0025);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const active = listening || useManual;

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
      {loadingModel && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-black/55 text-white/90 text-xs px-4 py-2 rounded-full backdrop-blur-sm">
            Model load ho raha hai…
          </div>
        </div>
      )}

      {modelError && !error && (
        <div className="absolute top-28 left-3 right-3 z-20 flex justify-center">
          <div className="bg-amber-500/20 border border-amber-400/40 text-amber-100 text-xs px-3 py-2 rounded-lg max-w-sm text-center">
            {modelError}
          </div>
        </div>
      )}

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

          {/* Manual toggle */}
          <button
            onClick={() => {
              if (useManual) {
                setUseManual(false);
                applyWind(0);
              } else {
                stopMic();
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

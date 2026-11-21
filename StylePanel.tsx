import { X } from 'lucide-react';
import type { CharacterPreset, LocationPreset } from '../lib/types';
import { CHARACTERS } from '../lib/characters';
import { LOCATION_LIST } from '../lib/locations';

interface Props {
  character: CharacterPreset;
  location: LocationPreset;
  onCharacter: (c: CharacterPreset) => void;
  onLocation: (l: LocationPreset) => void;
  onClose: () => void;
}

export default function StylePanel({
  character,
  location,
  onCharacter,
  onLocation,
  onClose,
}: Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-[#121820]/95 backdrop-blur-md border-t border-white/10 shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#121820] z-10">
        <h2 className="text-sm font-semibold tracking-wide text-white/90">Style & Place</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 text-white/70"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Characters */}
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-white/50 mb-3">
            Character
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {CHARACTERS.map((c) => {
              const active = c.id === character.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onCharacter(c)}
                  className={`text-left rounded-xl p-3 border transition-all ${
                    active
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div
                      className="w-6 h-6 rounded-full border border-white/20 shrink-0"
                      style={{ background: c.swatch }}
                    />
                    <span className="text-sm font-medium text-white/90">{c.name}</span>
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200">
                      {c.kind === 'garment' ? 'Outfit' : 'Model'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-snug">{c.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Locations */}
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-white/50 mb-3">
            Location
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {LOCATION_LIST.map((loc) => {
              const active = loc.id === location.id;
              return (
                <button
                  key={loc.id}
                  onClick={() => onLocation(loc)}
                  className={`text-left rounded-xl p-3 border transition-all ${
                    active
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-5 h-5 rounded-md border border-white/15"
                      style={{
                        background: `linear-gradient(180deg, ${loc.skyTop}, ${loc.skyBottom})`,
                      }}
                    />
                    <span className="text-sm font-medium text-white/90">{loc.name}</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-snug">{loc.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

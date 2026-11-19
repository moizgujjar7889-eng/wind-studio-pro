interface Props {
  level: number;
  peak: number;
  active: boolean;
}

export default function WindMeter({ level, peak, active }: Props) {
  const pct = Math.round(level * 100);
  const peakPct = Math.round(peak * 100);

  let barColor = 'bg-emerald-400';
  if (level > 0.7) barColor = 'bg-rose-400';
  else if (level > 0.4) barColor = 'bg-amber-400';

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-center justify-between mb-1.5 text-xs text-white/70">
        <span>{active ? 'Wind' : 'Idle'}</span>
        <span className="font-medium tabular-nums text-white/90">{pct}%</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/10 overflow-hidden">
        {/* Peak marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/50"
          style={{ left: `${peakPct}%` }}
        />
        <div
          className={`wind-bar h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

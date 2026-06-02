// Phase 4 — rest countdown that auto-starts on set completion, beeps near the
// end and at zero, and can be skipped/adjusted for a single rest (FR-013..FR-016).
// Audio degrades silently to the visual countdown.
import { useEffect, useRef, useState } from 'react';
import { beep } from '../lib/restTimerAudio.js';
import { formatDuration } from '../lib/sessionTime.js';

const NEAR_END_S = 10;

export default function RestTimer({ seconds, onDone }) {
  const [remaining, setRemaining] = useState(seconds);
  const nearFired = useRef(false);
  const zeroFired = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    nearFired.current = false;
    zeroFired.current = false;
    const id = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1;
        if (next === NEAR_END_S && !nearFired.current) {
          nearFired.current = true;
          beep({ frequency: 660, durationMs: 120 });
        }
        if (next <= 0 && !zeroFired.current) {
          zeroFired.current = true;
          beep({ frequency: 990, durationMs: 260 });
          onDone?.();
        }
        return next > 0 ? next : 0;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const adjust = (delta) => setRemaining((r) => Math.max(0, r + delta));
  const skip = () => {
    zeroFired.current = true;
    setRemaining(0);
    onDone?.();
  };
  const btn = 'min-h-[44px] px-md rounded-md bg-muted/15 text-sm text-text hover:bg-muted/30';

  return (
    <div
      data-testid="rest-timer"
      className="flex flex-col items-center gap-sm rounded-lg border border-accent/40 bg-surface px-lg py-md"
    >
      <span className="text-xs uppercase tracking-wide text-muted">Repos</span>
      <span className="font-mono text-3xl font-bold text-accent tabular-nums" aria-live="polite">
        {formatDuration(remaining)}
      </span>
      <div className="flex gap-xs">
        <button type="button" className={btn} onClick={() => adjust(-15)}>
          −15s
        </button>
        <button type="button" className={btn} onClick={() => adjust(15)}>
          +15s
        </button>
        <button type="button" className={btn} onClick={skip}>
          Passer
        </button>
      </div>
    </div>
  );
}

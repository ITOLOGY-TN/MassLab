// Phase 4 — Web Audio rest-timer cue. Pure side-effect helper that degrades
// silently to a no-op when audio is unavailable/muted/unsupported (FR-016): the
// visual countdown always completes regardless of the return value.
let ctx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Play a short sine beep. Returns true if it played, false if audio was unavailable. */
export async function beep({ frequency = 880, durationMs = 150, volume = 0.08 } = {}) {
  const c = getCtx();
  if (!c) return false;
  try {
    // Resume a suspended context BEFORE scheduling so the tone actually plays.
    if (c.state === 'suspended') await c.resume?.();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + durationMs / 1000);
    return true;
  } catch {
    return false;
  }
}

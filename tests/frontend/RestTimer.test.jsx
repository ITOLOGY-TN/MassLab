import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Mock the Web Audio beeper so the cue points are observable without audio.
vi.mock('../../frontend/src/lib/restTimerAudio.js', () => ({ beep: vi.fn() }));
import { beep } from '../../frontend/src/lib/restTimerAudio.js';
import RestTimer from '../../frontend/src/components/RestTimer.jsx';

beforeEach(() => {
  vi.useFakeTimers();
  beep.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RestTimer (US2)', () => {
  it('counts down, beeps near the end and at zero, and fires onDone', () => {
    const onDone = vi.fn();
    render(<RestTimer seconds={12} onDone={onDone} />);
    expect(screen.getByTestId('rest-timer')).toBeInTheDocument();

    // Advance to the near-end threshold (10 s remaining → 1 cue).
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(beep).toHaveBeenCalledTimes(1);

    // Advance to zero (second cue + onDone).
    act(() => {
      vi.advanceTimersByTime(11000);
    });
    expect(beep).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalled();
  });
});

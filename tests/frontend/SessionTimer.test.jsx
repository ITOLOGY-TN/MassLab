import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SessionTimer from '../../frontend/src/components/SessionTimer.jsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionTimer (US2)', () => {
  it('renders elapsed time from started_at and ticks up', () => {
    const fixed = new Date('2026-06-02T08:00:00Z').getTime();
    vi.useFakeTimers({ now: fixed });
    const startedAt = new Date(fixed - 65_000).toISOString(); // 1:05 ago

    render(<SessionTimer startedAt={startedAt} />);
    expect(screen.getByTestId('session-timer').textContent).toBe('01:05');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('session-timer').textContent).toBe('01:06');
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WorkingPulse } from './WorkingPulse.tsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkingPulse', () => {
  it('shows no progress bar when there is no start time', () => {
    const { container } = render(<WorkingPulse label="Loading…" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(container.querySelector('.working-pulse-track')).toBeNull();
  });

  it('shows a bar and a clock that keeps ticking while work runs', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const { container } = render(
      <WorkingPulse label="Reading your file…" since={startedAt} />,
    );

    expect(container.querySelector('.working-pulse-track')).not.toBeNull();
    expect(screen.getByText('0s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('5s')).toBeInTheDocument();

    // Past a minute is exactly the moment someone starts wondering whether
    // it died, so it has to stay readable rather than run up raw seconds.
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    expect(screen.getByText('1m 25s')).toBeInTheDocument();
  });
});

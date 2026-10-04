import { render, screen, waitFor } from '@testing-library/react';
import { toServerTimestamp, type HealthReport } from '@pulseboard/shared';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { ApiRequestError, type ApiClient } from '../src/api/client.js';

const REPORT: HealthReport = {
  status: 'ok',
  version: '0.1.0',
  startedAt: toServerTimestamp(new Date('2026-10-04T11:00:00.000Z')),
  checkedAt: toServerTimestamp(new Date('2026-10-04T12:00:00.000Z')),
  checks: [{ name: 'process', status: 'ok' }],
};

function fakeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getHealth: vi.fn(async () => REPORT),
    getReadiness: vi.fn(async () => REPORT),
    ...overrides,
  };
}

describe('App', () => {
  it('shows a loading state before the response arrives', () => {
    render(<App client={fakeClient()} />);

    expect(screen.getByTestId('health-state').textContent).toContain('Checking API status');
  });

  it('renders the health report once it arrives', async () => {
    render(<App client={fakeClient()} />);

    // Wait on the panel, not a text match: the loading text also contains
    // "API status", so a regex would match the wrong element.
    await waitFor(() => {
      expect(screen.getByTestId('health-state').textContent).toContain('API status:');
    });

    const panel = screen.getByTestId('health-state');
    expect(panel.textContent).toContain('ok');
    expect(panel.textContent).toContain('0.1.0');
    expect(screen.getByText('process: ok')).toBeDefined();
  });

  it('renders each check message when the API supplies one', async () => {
    const client = fakeClient({
      getHealth: vi.fn(async (): Promise<HealthReport> => ({
        ...REPORT,
        status: 'degraded',
        checks: [
          { name: 'database', status: 'ok' },
          { name: 'migrations', status: 'degraded', message: '2 pending migration(s)' },
        ],
      })),
    });

    render(<App client={client} />);

    await waitFor(() => {
      expect(screen.getByTestId('health-state').textContent).toContain('API status:');
    });

    expect(screen.getByText('migrations: degraded — 2 pending migration(s)')).toBeDefined();
  });

  it('shows an error state with the request id when the API fails', async () => {
    const client = fakeClient({
      getHealth: vi.fn(async () => {
        throw new ApiRequestError('Service not found', {
          code: 'NOT_FOUND',
          status: 404,
          requestId: 'req-7',
        });
      }),
    });

    render(<App client={client} />);

    const alert = await screen.findByRole('alert');

    expect(alert.textContent).toBe('Service not found (request req-7)');
  });

  it('shows an error state when the API is unreachable', async () => {
    const client = fakeClient({
      getHealth: vi.fn(async () => {
        throw new ApiRequestError('Could not reach the PulseBoard API', {
          code: 'NETWORK_ERROR',
        });
      }),
    });

    render(<App client={client} />);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not reach the PulseBoard API',
    );
  });

  it('never renders an unexpected thrown value to the user', async () => {
    const client = fakeClient({
      getHealth: vi.fn(async () => {
        throw new Error('postgres://pulse:hunter2@db.internal');
      }),
    });

    render(<App client={client} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('An unexpected error occurred');
    expect(document.body.textContent).not.toContain('hunter2');
  });

  it('aborts the in-flight request when unmounted', () => {
    let receivedSignal: AbortSignal | undefined;

    const client = fakeClient({
      getHealth: vi.fn((signal?: AbortSignal) => {
        receivedSignal = signal;

        return new Promise<HealthReport>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      }),
    });

    const { unmount } = render(<App client={client} />);

    expect(receivedSignal?.aborted).toBe(false);

    unmount();

    // Unmounting must abort, otherwise the request outlives the component that
    // asked for it.
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('does not update state after unmount when the request resolves late', async () => {
    let resolveHealth: ((value: HealthReport) => void) | undefined;
    const client = fakeClient({
      getHealth: vi.fn(
        () =>
          new Promise<HealthReport>((resolve) => {
            resolveHealth = resolve;
          }),
      ),
    });
    const { unmount } = render(<App client={client} />);
    unmount();

    resolveHealth?.(REPORT);

    // React logs a warning if state is set after unmount; reaching the next tick
    // without an error or a thrown render is the observable guarantee.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('health-state')).toBeNull();
  });
});
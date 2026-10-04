import { formatServerTimestamp, type HealthReport } from '@pulseboard/shared';
import { useEffect, useState } from 'react';

import { describeApiError, type ApiClient } from './api/client.js';

type HealthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly report: HealthReport }
  | { readonly kind: 'error'; readonly message: string };

export interface AppProps {
  /**
   * Injected rather than constructed inside the component so the network layer
   * can be replaced by a fake in tests without module mocking.
   */
  readonly client: ApiClient;
}

function renderStatus(state: HealthState) {
  if (state.kind === 'loading') {
    return <p data-testid="health-state">Checking API status…</p>;
  }

  if (state.kind === 'error') {
    return (
      <p data-testid="health-state" role="alert">
        {state.message}
      </p>
    );
  }

  const { report } = state;

  return (
    <div data-testid="health-state">
      <p>
        API status: <strong>{report.status}</strong> (version {report.version}, checked{' '}
        {formatServerTimestamp(report.checkedAt)})
      </p>
      <ul>
        {report.checks.map((check) => (
          <li key={check.name}>
            {check.name}: {check.status}
            {check.message === undefined ? '' : ` — ${check.message}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Application shell.
 *
 * The dashboard is a later milestone; this proves the shell, the transport and
 * the loading/ready/error states are wired correctly.
 */
export function App({ client }: AppProps) {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    // Guards against setting state after unmount, which React would otherwise
    // warn about and which would resurrect destroyed state (code-review
    // section 4: promises resolving after cleanup).
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const report = await client.getHealth(controller.signal);
        if (active) setState({ kind: 'ready', report });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setState({ kind: 'error', message: describeApiError(error) });
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [client]);

  return (
    <main>
      <h1>PulseBoard</h1>
      <p>Real-time observability &amp; incident intelligence.</p>
      <section aria-live="polite" aria-busy={state.kind === 'loading'}>
        {renderStatus(state)}
      </section>
    </main>
  );
}
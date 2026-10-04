import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerShutdownHandlers,
  type SignalSource,
} from '../src/server.js';

type SignalListener = (signal: NodeJS.Signals) => void;

/** Minimal `process`-compatible signal source with real `once` semantics. */
class FakeSignalSource implements SignalSource {
  readonly #listeners = new Map<NodeJS.Signals, Set<SignalListener>>();

  once(event: NodeJS.Signals, listener: SignalListener): this {
    const existing = this.#listeners.get(event) ?? new Set<SignalListener>();
    existing.add(listener);
    this.#listeners.set(event, existing);
    return this;
  }

  off(event: NodeJS.Signals, listener: SignalListener): this {
    this.#listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: NodeJS.Signals): void {
    const registered = this.#listeners.get(event);
    if (registered === undefined) return;

    // `once` semantics: the listener is detached before it is invoked.
    this.#listeners.set(event, new Set());
    for (const listener of [...registered]) listener(event);
  }

  listenerCount(): number {
    let total = 0;
    for (const listeners of this.#listeners.values()) total += listeners.size;
    return total;
  }
}

describe('registerShutdownHandlers', () => {
  let app: ReturnType<typeof Fastify>;
  let signals: FakeSignalSource;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    app = Fastify({ logger: false });
    signals = new FakeSignalSource();
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('resolves when %s is received', async (signal) => {
    const controller = registerShutdownHandlers(app, 5_000, signals);

    signals.emit(signal);

    await expect(controller.signalsReceived).resolves.toBeUndefined();
    controller.dispose();
  });

  it('does not resolve before a signal arrives', async () => {
    const controller = registerShutdownHandlers(app, 5_000, signals);

    let resolved = false;
    void controller.signalsReceived.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(resolved).toBe(false);

    controller.dispose();
  });

  it('removes both signal listeners on dispose', () => {
    const controller = registerShutdownHandlers(app, 5_000, signals);
    expect(signals.listenerCount()).toBe(2);

    controller.dispose();

    expect(signals.listenerCount()).toBe(0);
  });

  it('forces exit when a shutdown is left hanging', async () => {
    const controller = registerShutdownHandlers(app, 1_000, signals);

    signals.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(999);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);

    controller.dispose();
  });

  it('cancels the force-exit guard once shutdown is disposed, so a clean exit is not overridden', async () => {
    const controller = registerShutdownHandlers(app, 1_000, signals);

    signals.emit('SIGINT');
    controller.dispose();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(exit).not.toHaveBeenCalled();
  });

  it('ignores a repeated signal instead of starting a second shutdown', async () => {
    const controller = registerShutdownHandlers(app, 1_000, signals);

    signals.emit('SIGTERM');
    signals.emit('SIGINT');
    signals.emit('SIGTERM');

    await vi.advanceTimersByTimeAsync(10_000);

    // Only the first signal armed the guard; the others were refused.
    expect(exit).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('still resolves after a refused repeat signal', async () => {
    const controller = registerShutdownHandlers(app, 1_000, signals);

    signals.emit('SIGINT');
    signals.emit('SIGTERM');

    await expect(controller.signalsReceived).resolves.toBeUndefined();

    controller.dispose();
  });
});
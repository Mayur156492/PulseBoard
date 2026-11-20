/**
 * Shared shutdown coordination primitives used by the API and incident scheduler.
 */

export interface ShutdownController {
  readonly shuttingDown: boolean;
  readonly shutdownStartedAt: number | null;
  markShutdown(): void;
  isShutdownAllowed(): boolean;
}

export function createShutdownController(): ShutdownController {
  let shuttingDown = false;
  let shutdownStartedAt: number | null = null;

  return {
    get shuttingDown() {
      return shuttingDown;
    },
    get shutdownStartedAt() {
      return shutdownStartedAt;
    },
    markShutdown() {
      shuttingDown = true;
      shutdownStartedAt = Date.now();
    },
    isShutdownAllowed() {
      return shuttingDown;
    },
  };
}

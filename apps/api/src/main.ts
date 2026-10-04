import { ConfigError } from './config.js';
import { main } from './server.js';

/**
 * Process entrypoint.
 *
 * Kept separate from `server.ts` so that importing the composition root has no
 * side effects; only running this file starts the server.
 */
main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`PulseBoard API failed to start: ${String(error)}\n`);
  }

  process.exitCode = 1;
});
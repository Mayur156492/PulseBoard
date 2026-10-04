/** Where the API lives when nothing is configured. */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';

/**
 * Resolves the API base URL.
 *
 * A configured value must be an absolute http(s) URL. An invalid value throws
 * at startup instead of silently falling back, because a client quietly talking
 * to the wrong origin is far harder to diagnose than a failed boot
 * (pulseboard-architecture: explicit configuration handling).
 *
 * @throws Error when the value is present but not a usable absolute URL.
 */
export function readApiBaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_API_BASE_URL;

  const candidate = raw.trim();

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`VITE_API_BASE_URL must be an absolute URL, received "${candidate}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `VITE_API_BASE_URL must use http or https, received "${parsed.protocol.replace(':', '')}"`,
    );
  }

  return candidate.replace(/\/+$/, '');
}

/** The resolved API base URL for this build. */
export const apiBaseUrl: string = readApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
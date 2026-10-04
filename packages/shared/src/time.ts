/**
 * Server-normalized timestamps.
 *
 * pulseboard-architecture rule 8 requires metrics to carry server-normalized
 * timestamps. `ServerTimestamp` is a branded number of epoch milliseconds, so
 * a raw `Date`, an ISO string or a seconds-based number cannot be passed where
 * a normalized timestamp is expected without going through
 * {@link toServerTimestamp}.
 */
declare const serverTimestampBrand: unique symbol;

export type ServerTimestamp = number & {
  readonly [serverTimestampBrand]: 'ServerTimestamp';
};

/**
 * Normalize a `Date` or epoch-milliseconds number to a {@link ServerTimestamp}.
 *
 * @throws RangeError if the value is not a finite time. Silently substituting
 * `Date.now()` would fabricate telemetry data, so this fails loudly instead.
 */
export function toServerTimestamp(value: Date | number): ServerTimestamp {
  const milliseconds = value instanceof Date ? value.getTime() : value;

  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`Cannot normalize non-finite timestamp: ${String(value)}`);
  }

  // Epoch milliseconds are integers; truncating keeps the branded type honest
  // and avoids clients disagreeing about sub-millisecond precision.
  return Math.trunc(milliseconds) as ServerTimestamp;
}

/**
 * Render a {@link ServerTimestamp} as a UTC ISO-8601 string for display.
 *
 * Presentation only: never use this as the transport format.
 */
export function formatServerTimestamp(value: ServerTimestamp): string {
  return new Date(value).toISOString();
}
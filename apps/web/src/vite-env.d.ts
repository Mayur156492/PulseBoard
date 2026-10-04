/// <reference types="vite/client" />

/**
 * Typed view of the environment variables this app reads.
 *
 * Vite's default declaration exposes every `VITE_` variable as `any`, which
 * would defeat compile-time checking, so the shape is narrowed here.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
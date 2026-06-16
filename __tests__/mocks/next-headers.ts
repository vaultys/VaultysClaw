/**
 * Vitest stub for "next/headers".
 * Aliased in vitest.config.mjs — prevents "headers called outside request scope"
 * errors when next-auth or other Next.js modules call headers()/cookies() in tests.
 */

export function headers(): Headers {
  return new Headers();
}

export function cookies() {
  return {
    get: (_name: string) => null,
    getAll: () => [],
    has: (_name: string) => false,
    set: () => {},
    delete: () => {},
  };
}

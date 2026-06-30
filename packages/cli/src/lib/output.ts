/**
 * Terminal output helpers. Human-readable by default (the demo's ✓ / ✗ / ↳
 * style); `--json` switches every command to machine-readable JSON.
 */

let jsonMode = false;

export function setJsonMode(on: boolean): void {
  jsonMode = on;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** ✓ success line (suppressed in --json mode). */
export function ok(msg: string): void {
  if (!jsonMode) console.log(` ✓ ${msg}`);
}

/** ✗ failure line (suppressed in --json mode). */
export function fail(msg: string): void {
  if (!jsonMode) console.log(` ✗ ${msg}`);
}

/** ↳ secondary / detail line (suppressed in --json mode). */
export function sub(msg: string): void {
  if (!jsonMode) console.log(`  ↳ ${msg}`);
}

export function info(msg: string): void {
  if (!jsonMode) console.log(msg);
}

/** Emit a JSON payload (always, regardless of mode — used for record output). */
export function printJson(obj: unknown): void {
  console.log(JSON.stringify(obj, null, jsonMode ? 0 : 2));
}

/** In --json mode print JSON; otherwise run the human-readable renderer. */
export function render(obj: unknown, human: () => void): void {
  if (jsonMode) printJson(obj);
  else human();
}

/**
 * Refuse to start a production control plane on a guessable NEXTAUTH_SECRET.
 *
 * NEXTAUTH_SECRET signs the session JWT (and the agent enrolment tokens). Anyone who knows it can
 * mint a session carrying an admin's DID — DIDs are not secret, the console shows them — and
 * walk into the whole admin console. NextAuth itself only complains when the secret is *missing*,
 * so a value copied from this repository (an old compose default, an .env example) would be
 * accepted silently. This check runs before the server listens.
 *
 * Production only: `next dev` never reaches it. The fleet-simulator and demo-video stacks run a
 * production build with secrets committed in docker/simulator.env and docker/video.env; those
 * files set VAULTYSCLAW_ALLOW_INSECURE_SECRETS=1, which docker/docker-compose.yml never passes
 * through.
 */

/** Every value this repository has ever shipped as a default or an example. */
const PUBLISHED_SECRETS = new Set([
  "insecure-dev-secret-change-me",
  "change_me_with_openssl_rand_base64_32",
  "change-me-generate-a-real-secret",
  "simulator-demo-not-a-real-secret",
  "video-demo-not-a-real-secret",
  "test-secret-for-enrollment-tokens",
]);

/** 32 characters ≈ `openssl rand -base64 24`; `openssl rand -hex 32` gives 64. */
export const MIN_SECRET_LENGTH = 32;

/** Returns the reason the secret is unacceptable, or null when it is fine. */
export function nextAuthSecretProblem(secret: string | undefined): string | null {
  if (!secret || !secret.trim()) return "NEXTAUTH_SECRET is not set";
  if (PUBLISHED_SECRETS.has(secret.trim())) return "NEXTAUTH_SECRET is a value published in the VaultysClaw repository";
  if (/change[-_ ]?me|insecure|not[-_ ]a[-_ ]real/i.test(secret)) {
    return "NEXTAUTH_SECRET is a placeholder";
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    return `NEXTAUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`;
  }
  if (new Set(secret).size < 8) return "NEXTAUTH_SECRET has too little variety to be random";
  return null;
}

/** Throws when a production process would start on an unacceptable secret. */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.VAULTYSCLAW_ALLOW_INSECURE_SECRETS === "1") return;
  const problem = nextAuthSecretProblem(env.NEXTAUTH_SECRET);
  if (problem) {
    throw new Error(
      `${problem}. Refusing to start: anyone who knows it can forge an admin session. ` +
        `Generate one with \`openssl rand -hex 32\` and set NEXTAUTH_SECRET.`,
    );
  }
}

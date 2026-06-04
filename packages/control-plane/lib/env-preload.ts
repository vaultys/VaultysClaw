/**
 * Loaded as the very first import in server.ts so that DATABASE_URL and other
 * package-level env vars are available before Prisma client is initialised.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load package-level env files (Next.js convention: .env.local overrides .env)
dotenv.config({ path: path.join(packageDir, ".env.local") });
dotenv.config({ path: path.join(packageDir, ".env") });

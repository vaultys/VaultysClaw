import path from "path";
import { OUTPUT } from "../stack";

const DIR = path.join(OUTPUT, ".auth");
/** The filmed admin's signed-in browser state (session cookie + the VaultysID in localStorage). */
export const AUTH = path.join(DIR, "admin.json");
/** That admin's browser-held VaultysID, as `pnpm simulator admin` exports it. */
export const IDENTITY = path.join(DIR, "admin.identity.json");
/** The encrypted backup the same command writes (unused here, kept beside the key it encrypts). */
export const BACKUP = path.join(DIR, "admin-backup.json");
/** The fleet process left running while the videos are filmed, killed by teardown.ts. */
export const FLEET_PID = path.join(OUTPUT, ".fleet.pid");
export const FLEET_LOG = path.join(OUTPUT, "fleet.log");

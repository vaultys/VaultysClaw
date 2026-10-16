import fs from "fs";
import { FLEET_PID } from "./setup/auth";

/** Stops the fleet setup/ left running, unless VIDEO_KEEP_FLEET=1 (several runs in a row skip the reconnect). */
export default function teardown() {
  if (process.env.VIDEO_KEEP_FLEET === "1" || !fs.existsSync(FLEET_PID)) return;
  const pid = Number(fs.readFileSync(FLEET_PID, "utf8"));
  try {
    // The whole process group: pnpm, then the node process it started.
    process.kill(-pid, "SIGINT");
  } catch {
    // Already gone.
  }
  fs.rmSync(FLEET_PID, { force: true });
}

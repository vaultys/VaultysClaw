import { MissionControlCore } from "../../../components/mission-control/MissionControlCore";

/**
 * Standalone fullscreen Mission Control — rendered without AppShell
 * (sidebar and topbar are not mounted at all).
 *
 * Auth is handled inside MissionControlCore via useRole():
 * non-admins are redirected to "/".
 */
export default function MissionControlFullscreenPage() {
  return <MissionControlCore mode="standalone" />;
}

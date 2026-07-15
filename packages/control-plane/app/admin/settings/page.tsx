import { redirect } from "next/navigation";

// User-level settings now live under /app/settings. Anyone landing on the old
// /admin/settings index is sent to their personal settings.
export default function SettingsIndexPage() {
  redirect("/app/settings/profile");
}

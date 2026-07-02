import { redirect } from "next/navigation";

/**
 * Admin area index. There is no standalone /admin page — send admins to the
 * primary admin dashboard. Access to /admin* is already gated by the proxy.
 */
export default function AdminHome() {
  redirect("/admin/mission-control");
}

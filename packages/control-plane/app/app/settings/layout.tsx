import type { ReactNode } from "react";
import { SettingsDataProvider } from "@/components/settings/SettingsContext";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsDataProvider>{children}</SettingsDataProvider>;
}

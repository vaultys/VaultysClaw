import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppShell from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "VaultysClaw Control Plane",
  description: "Secure AI agent orchestration platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <ThemeProvider>
          <SessionProviderWrapper>
            <AppShell>{children}</AppShell>
          </SessionProviderWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}


import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/platform/ui/AppShell";

export const metadata: Metadata = {
  title: "Internal Tools Platform",
  description: "Owned alternative to a low-code internal tool platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

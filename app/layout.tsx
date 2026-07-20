import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "OOXii Assist PoC",
  description: "Offline-first multilingual guided testing companion for OOXii lay testers.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "OOXii",
    capable: true,
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#150c1f"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}

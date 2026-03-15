import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "OutfitsMe",
  description: "Analyze outfits, build a wardrobe, and preview new looks from your own photos.",
  metadataBase: new URL(
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app-body">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Geist is a variable font — all weights (100–900) available via font-thin through font-black
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    template: "%s | Dutch",
    default: "Dutch — Split expenses with friends",
  },
  description: "Split expenses with friends and groups — simple, fast, fair.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Dutch",
    description: "Split expenses with friends and groups — simple, fast, fair.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "Dutch",
  },
  twitter: {
    card: "summary",
    title: "Dutch",
    description: "Split expenses with friends and groups — simple, fast, fair.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dutch",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full bg-background text-foreground antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

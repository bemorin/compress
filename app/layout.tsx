import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "../lib/site.ts";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.address),
  title: SITE.title,
  description: "Compress JPEG, PNG, WebP, AVIF and HEIC images privately in your browser, or check the pictures of a web page.",
  applicationName: SITE.title,
  openGraph: {
    title: SITE.title,
    description: "Make images lighter in your browser. Nothing is uploaded.",
    type: "website",
  },
  icons: { icon: "/icon.svg" },
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions may add attributes to <html> before React starts.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies a saved light or dark choice before the first paint, so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { GlobalPlayer } from "@/components/global-player";
import { QueryProvider } from "@/components/query-provider";
import { SITE_URL } from "@/lib/content/site-url";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_TITLE = "Wildcat Radio — CIT-U Campus Radio";
const SITE_DESCRIPTION =
  "Wildcat Radio is the campus radio station of the Cebu Institute of Technology – University. Tune in, request a song, join the room.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · Wildcat Radio",
  },
  description: SITE_DESCRIPTION,
  // Match the prototype: the wildcat mascot mark is the favicon / tab icon.
  icons: { icon: "/brand/logo-mascot-mark.png" },
  openGraph: {
    type: "website",
    siteName: "Wildcat Radio",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_PH",
    url: "/",
    // Explicit, not just the file-convention auto-wiring — that only applies
    // to the exact segment `opengraph-image.tsx` lives in (the homepage).
    // Referencing it here makes every route that doesn't set its own
    // `openGraph.images` inherit this one via normal metadata inheritance.
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  themeColor: "#820001",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `suppressHydrationWarning` is required, not cosmetic: the staff theme
  // script (FE#39) adds `.dark` to <html> before React hydrates, so the server
  // markup and the client DOM legitimately disagree on this one element's
  // className. Without it React logs a hydration mismatch on every staff page
  // load. It suppresses only this element's own attributes — one level deep —
  // so a real mismatch anywhere inside still reports.
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          {children}
          <GlobalPlayer />
        </QueryProvider>
      </body>
    </html>
  );
}

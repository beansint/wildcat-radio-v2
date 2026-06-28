import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { GlobalPlayer } from "@/components/global-player";
import { QueryProvider } from "@/components/query-provider";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wildcat Radio — CIT-U Campus Radio",
  description:
    "Wildcat Radio is the campus radio station of the Cebu Institute of Technology – University. Tune in, request a song, join the room.",
  // Match the prototype: the wildcat mascot mark is the favicon / tab icon.
  icons: { icon: "/brand/logo-mascot-mark.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          {children}
          <GlobalPlayer />
        </QueryProvider>
      </body>
    </html>
  );
}

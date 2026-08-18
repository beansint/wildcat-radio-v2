import type { MetadataRoute } from "next";

// Brand colour as defined in src/app/globals.css (`--maroon`) — transcribed,
// not invented.
const BRAND_MAROON = "#820001";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wildcat Radio — CIT-U Campus Radio",
    short_name: "Wildcat Radio",
    description:
      "Wildcat Radio is the campus radio station of the Cebu Institute of Technology – University. Tune in, request a song, join the room.",
    start_url: "/",
    display: "standalone",
    background_color: BRAND_MAROON,
    theme_color: BRAND_MAROON,
    icons: [
      {
        src: "/brand/logo-mascot-mark.png",
        sizes: "any",
        type: "image/png",
      },
      {
        src: "/brand/logo-mascot-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

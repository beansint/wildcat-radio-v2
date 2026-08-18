import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared default OG/Twitter card, generated from the existing wordmark lockup
 * on the brand maroon (no new binary art — code renders the card). Referenced
 * explicitly from `openGraph.images` / `twitter.images` in the root layout so
 * every route inherits it (Next only auto-wires a convention image file into
 * the metadata of the exact segment it lives in — the root layout reference
 * is what makes it apply site-wide).
 */
export const alt = "Wildcat Radio — CIT-U Campus Radio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_MAROON = "#820001";
const BRAND_MAROON_DEEP = "#630001";
const BRAND_GOLD = "#ffdf01";

export default async function Image() {
  const wordmark = await readFile(
    join(process.cwd(), "public", "brand", "logo-wordmark-lockup.png"),
  );
  const wordmarkSrc = `data:image/png;base64,${wordmark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(150deg, ${BRAND_MAROON} 0%, ${BRAND_MAROON_DEEP} 100%)`,
        }}
      >
        {/* next/image is unsupported inside ImageResponse (satori doesn't render the DOM/browser image pipeline it needs), so a plain <img> is the documented, correct choice here — not an oversight the no-img-element rule should flag. */}
        <img
          src={wordmarkSrc}
          alt=""
          width={640}
          height={360}
          style={{ objectFit: "contain" }}
        />
        <div
          style={{
            marginTop: 24,
            fontSize: 32,
            fontWeight: 700,
            color: BRAND_GOLD,
            letterSpacing: 2,
          }}
        >
          CIT-U CAMPUS RADIO
        </div>
      </div>
    ),
    { ...size },
  );
}

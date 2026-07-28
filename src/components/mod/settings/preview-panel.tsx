"use client";

/**
 * Live listener preview — binds station name, tagline, hero line and
 * off-air copy without saving (SET-U-08). A local live/off-air scene
 * switch lets a mod see both states; it's UI-only, not itself a setting.
 * The Moderation tab has no public surface, so it renders the prototype's
 * neutral state instead of a scene.
 *
 * `PreviewContent` is authored once and reused both in the desktop sticky
 * column (`data-testid="mod-settings-preview"`) and inside the mobile
 * bottom sheet — same markup, no divergent copy to keep in sync.
 */
import { useState } from "react";
import type { SettingsTabKey } from "./tab-config";
import type { RawValues } from "./use-settings-form";
import { useIsDesktopPreview } from "./use-is-desktop-preview";

interface PreviewContentProps {
  values: RawValues;
  activeTab: SettingsTabKey;
}

function PreviewContent({ values, activeTab }: PreviewContentProps) {
  const [scene, setScene] = useState<"live" | "off">("live");
  const stationName = (values["branding.stationName"] as string) || "Wildcat Radio";
  const tagline = (values["branding.tagline"] as string) || "";
  const heroLine = (values["copy.heroLine"] as string) || "";
  const offAir = (values["copy.offAirScheduled"] as string) || "";
  const hours = (values["copy.broadcastHours"] as string) || "";

  const hasPublicSurface = activeTab === "branding" || activeTab === "copy" || activeTab === "toggles";

  return (
    <div className="wc-card overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ background: "var(--muted)", borderColor: "var(--border)" }}
      >
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#febc2e" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#28c840" }} />
        </span>
        <span
          className="flex-1 text-center text-[.7rem] font-semibold truncate px-2 py-0.5 rounded-md"
          style={{ background: "var(--background)", color: "var(--muted-foreground)" }}
        >
          wildcatradio.citu.edu
        </span>
      </div>

      {hasPublicSurface ? (
        <>
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="wc-help" style={{ margin: 0 }}>
              Listener view
            </span>
            <div className="wc-seg" style={{ fontSize: ".7rem" }}>
              <button type="button" className={scene === "live" ? "active" : undefined} onClick={() => setScene("live")}>
                Live
              </button>
              <button type="button" className={scene === "off" ? "active" : undefined} onClick={() => setScene("off")}>
                Off-air
              </button>
            </div>
          </div>

          <div style={{ background: "var(--background)" }}>
            <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
              <span className="wc-avatar h-7 w-7 flex-none" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-extrabold text-sm leading-tight truncate">{stationName}</div>
                {tagline && <div className="wc-help truncate" style={{ margin: 0 }}>{tagline}</div>}
              </div>
            </div>

            {heroLine && <p className="px-3 pb-2.5 text-[.8rem] font-semibold leading-snug">{heroLine}</p>}

            {scene === "live" ? (
              <div className="px-3 pb-2.5">
                <div className="wc-card" style={{ background: "var(--card)" }}>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="wc-badge-live text-[.6rem] py-0.5">
                        <span className="dot" />
                        Live now
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="wc-art rounded-lg w-11 h-11 flex-none" />
                      <div className="min-w-0">
                        <div className="text-[.6rem] font-bold uppercase tracking-wide wc-muted">On air</div>
                        <div className="font-extrabold text-sm truncate">Afternoon Vibes</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-3 pb-2.5">
                <div className="wc-card" style={{ background: "var(--card)" }}>
                  <div className="p-3 text-center">
                    <span className="wc-badge-off text-[.6rem] py-0.5">Off air</span>
                    {offAir && <p className="text-[.8rem] mt-2">{offAir}</p>}
                    {hours && (
                      <span className="wc-chip-ghost text-[.65rem] mt-2.5">{hours}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="wc-help mt-2">
            No public surface — these settings apply to moderation, not the listener view.
          </p>
        </div>
      )}
    </div>
  );
}

export function PreviewPanel({ values, activeTab }: PreviewContentProps) {
  const isDesktop = useIsDesktopPreview();
  if (!isDesktop) return null;

  return (
    <aside className="lg:sticky" style={{ top: "1.75rem" }} data-testid="mod-settings-preview">
      <PreviewContent values={values} activeTab={activeTab} />
      <p className="wc-help text-center mt-2">Live preview — how listeners see your changes.</p>
    </aside>
  );
}

export { PreviewContent };

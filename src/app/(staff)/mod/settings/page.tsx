"use client";

/**
 * `/mod/settings` — 1:1 with
 * `docs/frontend-design-basis-prototype/mod/settings.html`, adapted to
 * render only registry-backed fields (feature.md AC-6, "Notes / decisions").
 *
 * Deliberately omitted, with no placeholder UI at all:
 * - the chat/requests/polls/reactions master switches (no backend layer has
 *   ever had them);
 * - the logo file upload (only a `branding.logoUrl` string key exists — it's
 *   rendered as a URL field under neutral "station image" copy instead, see
 *   `branding-tab.tsx`'s header comment for why it never says "logo");
 * - the entire Session tab (station-session issue/revoke was specified in
 *   `final-build-plan/03-API-CONTRACT.md` but never built; station auth is
 *   a signed cookie today, not a mod-issued token).
 *
 * One `GET /api/settings/admin` populates every field (`useSettingsForm`);
 * Save issues one `PUT` per genuinely changed key. The moderation block/
 * watch lists are `FilterEntry` rows (`/api/mod/filter`), a different
 * resource from the settings registry — see `filter-list-editor.tsx`.
 *
 * Desktop gets a sticky live-preview column; below `lg` that column isn't
 * mounted at all (not just CSS-hidden — see `use-is-desktop-preview.ts`)
 * and a floating FAB opens the same preview in a bottom sheet instead.
 */
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SETTINGS_TABS, type SettingsTabKey } from "@/components/mod/settings/tab-config";
import { BrandingTab } from "@/components/mod/settings/branding-tab";
import { CopyTab } from "@/components/mod/settings/copy-tab";
import { TogglesTab } from "@/components/mod/settings/toggles-tab";
import { ModerationTab } from "@/components/mod/settings/moderation-tab";
import { PreviewPanel, PreviewContent } from "@/components/mod/settings/preview-panel";
import { SaveBar } from "@/components/mod/settings/save-bar";
import { useSettingsForm } from "@/components/mod/settings/use-settings-form";

export default function ModSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("branding");
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const form = useSettingsForm();

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Station settings</h1>
        <p className="wc-muted">
          Branding, copy, features &amp; moderation policy for Wildcat Radio. Every change is
          audit-logged with your name.
        </p>
      </header>

      {form.isLoading ? (
        <div className="wc-stack">
          <div className="h-8 w-64 rounded-full bg-muted animate-pulse" />
          <div className="h-40 w-full rounded-xl bg-muted animate-pulse" />
        </div>
      ) : form.isError ? (
        <div role="alert" className="text-sm font-semibold text-destructive">
          Couldn&apos;t load settings.
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-7 lg:items-start">
          <div className="max-w-2xl min-w-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTabKey)}>
              <TabsList className="mb-5 flex-wrap">
                {SETTINGS_TABS.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} data-testid={`mod-settings-tabs-${tab.key}`}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="branding" className="wc-stack">
                <BrandingTab values={form.values} setValue={form.setValue} />
              </TabsContent>
              <TabsContent value="copy" className="wc-stack">
                <CopyTab values={form.values} setValue={form.setValue} />
              </TabsContent>
              <TabsContent value="toggles" className="wc-stack">
                <TogglesTab values={form.values} setValue={form.setValue} />
              </TabsContent>
              <TabsContent value="moderation" className="wc-stack">
                <ModerationTab values={form.values} setValue={form.setValue} />
              </TabsContent>
            </Tabs>

            <SaveBar
              isDirty={form.isFormDirty}
              isSaving={form.isSaving}
              onDiscard={form.discard}
              onSave={() => {
                void form.save();
              }}
              alertMessage={form.alertMessage}
              statusMessage={form.statusMessage}
            />
          </div>

          <PreviewPanel values={form.values} activeTab={activeTab} />
        </div>
      )}

      {!form.isLoading && !form.isError && (
        <Sheet open={previewSheetOpen} onOpenChange={setPreviewSheetOpen}>
          <Button
            type="button"
            variant="maroon"
            className="wc-btn-icon lg:hidden fixed bottom-5 right-5 z-40 rounded-full shadow-[var(--shadow-lg)]"
            data-testid="mod-settings-preview-fab"
            aria-label="Preview the listener view"
            onClick={() => setPreviewSheetOpen(true)}
          >
            Preview
          </Button>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Listener preview</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">
              <PreviewContent values={form.values} activeTab={activeTab} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

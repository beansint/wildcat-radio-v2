"use client";

/**
 * `/mod/announcements` — 1:1-adapted from
 * docs/frontend-design-basis-prototype/mod/announcements.html, but that
 * prototype predates decisions L34/L35 (feature.md Notes) and was NOT
 * copied verbatim. Dropped vs. the prototype:
 *   - the Audience (Public / Listeners-only) toggle — L35 removed the
 *     `audience` enum, column and settings key entirely; the staff DTO has
 *     no such field.
 *   - the second-mod "Approve feature" flow and its "you can't approve
 *     your own request" helper — L34: one moderator both publishes and
 *     features the same row, there is no second-approver concept.
 *   - "Restore" on archived rows and "Publish now" on scheduled rows —
 *     neither transition exists (`ARCHIVED` is terminal; `SCHEDULED ->
 *     PUBLISHED` only ever happens via the backend's own cron promoter).
 * Added vs. the prototype: the Submit step (DRAFT -> PENDING_REVIEW), the
 * PENDING_REVIEW and REJECTED tabs/states the prototype never drew, and
 * pin/unpin (the prototype only drew a static "Featured" chip).
 *
 * The selected tab is a server-side `status` filter, and the tab badges plus
 * the pin cap come from the response's whole-table `countsByStatus` /
 * `pinnedCount`. Counting client-side off one returned page was wrong the
 * moment the table outgrew that page: badges under-reported, older rows were
 * unreachable, and a pinned row past page 1 left the cap warning unrendered
 * so Pin looked available and the API answered 409 unannounced.
 *
 * Mutations invalidate the list route prefix rather than one params key,
 * because a lifecycle transition moves a row between tabs and the source
 * tab's cached page would otherwise stay stale.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  useAnnouncementsControllerList,
  getAnnouncementsControllerListQueryKey,
  announcementsControllerCreate,
  announcementsControllerUpdate,
  announcementsControllerSubmit,
  announcementsControllerReview,
  announcementsControllerArchive,
  announcementsControllerPin,
  announcementsControllerUnpin,
  announcementsControllerFeature,
  announcementsControllerUnfeature,
  announcementsControllerRequestPhotoUpload,
  announcementsControllerConfirmPhotoUpload,
} from "@/lib/api/endpoints/announcements/announcements";
import { useListSettingsAdmin } from "@/lib/api/endpoints/settings/settings";
import type { AnnouncementStaffDto, AnnouncementStaffPageDto, SettingDto } from "@/lib/api/model";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { humanizeAnnouncementError } from "@/lib/announcements/errors";
import { SegTabs } from "@/components/mod/seg-tabs";
import { Button } from "@/components/ui/button";
import { AnnouncementCard } from "@/components/mod/announcements/announcement-card";
import { AnnouncementFormDialog } from "@/components/mod/announcements/announcement-form-dialog";
import { ReviewDialog, type ReviewSubmitValues } from "@/components/mod/announcements/review-dialog";
import {
  ANNOUNCEMENT_TAB_KEYS,
  countsFromServer,
  tabStatusParam,
  filterByTab,
  tabLabel,
  type AnnouncementTabKey,
} from "@/components/mod/announcements/tabs";

const PAGE_SIZE = 100;
const DEFAULT_PIN_LIMIT = 2;

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  // Default to "all": the e2e golden paths never switch tabs while driving a
  // single row through draft -> pending -> published (etc.) and expect that
  // one `mod-ann-row` locator to stay visible and update in place the whole
  // way through (e2e/mod-announcements.spec.ts ANN-E-01, -02, -03, -04, -05,
  // -06, -07, -08, -09, -10, ANN-I-02/03/04). Only ANN-I-01 explicitly
  // switches tabs to verify partitioning, and it does so starting from this
  // same default.
  const [tab, setTab] = useState<AnnouncementTabKey>("all");

  const [formTarget, setFormTarget] = useState<AnnouncementStaffDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<AnnouncementStaffDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The selected tab is a *server-side* filter. Tallying statuses from one
  // returned page silently truncated at the page size — with four figures of
  // rows the badges under-reported and older rows were unreachable entirely.
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const listParams = useMemo(() => {
    const status = tabStatusParam(tab);
    return { pageSize, ...(status ? { status } : {}) };
  }, [tab, pageSize]);
  const listQuery = useAnnouncementsControllerList<AnnouncementStaffPageDto>(listParams);
  // The pin cap comes from the settings registry, but it is read off the
  // whole-registry admin list rather than `GET /settings/announcements.pinLimit`:
  // a key that has never been written 404s, and a 404 on every page load is a
  // console error the QA gate (INV-8) rightly refuses to ignore. The list route
  // returns whatever rows exist and simply omits the ones that don't.
  const settingsQuery = useListSettingsAdmin<SettingDto[]>();

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  // Badges and the pin cap are station-wide facts, so they come from the
  // server's whole-table counts, never from `items`.
  const counts = useMemo(
    () => countsFromServer(listQuery.data?.countsByStatus),
    [listQuery.data],
  );
  // The server already filtered to the selected tab; this stays as a
  // belt-and-braces pass so a stale page from the previous tab can never flash
  // rows that don't belong to it.
  const visibleItems = useMemo(() => filterByTab(items, tab), [items, tab]);
  const pinnedCount = listQuery.data?.pinnedCount ?? 0;
  const totalForTab = listQuery.data?.total ?? 0;
  const hasMore = items.length < totalForTab;
  const rawPinLimit = settingsQuery.data?.find((row) => row.key === "announcements.pinLimit")?.value;
  const pinLimit =
    typeof rawPinLimit === "number" && Number.isFinite(rawPinLimit) ? rawPinLimit : DEFAULT_PIN_LIMIT;

  function invalidateList() {
    // Every tab is its own query now, and a lifecycle transition moves a row
    // *between* tabs — so invalidating only the active params would leave the
    // source tab's badge and rows stale. Match on the route prefix instead.
    const [base] = getAnnouncementsControllerListQueryKey();
    return queryClient.invalidateQueries({ queryKey: [base] });
  }

  // Live copy of the currently-open edit target, refreshed whenever the
  // list refetches — the dialog never holds a stale local snapshot of
  // photos/title after a mutation (INV-5's "server state, not optimistic
  // fiction" applies here too).
  const liveFormTarget = formTarget ? (items.find((i) => i.id === formTarget.id) ?? formTarget) : null;

  const saveMutation = useMutation({
    mutationFn: async (values: { title: string; content: string }) => {
      if (liveFormTarget) {
        return announcementsControllerUpdate(liveFormTarget.id, {
          body: JSON.stringify(values),
        });
      }
      return announcementsControllerCreate({ body: JSON.stringify(values) });
    },
    onSuccess: async () => {
      await invalidateList();
      setFormTarget(null);
      setCreating(false);
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (vars: { kind: "submit" | "archive" | "pin" | "unpin" | "feature" | "unfeature"; id: string }) => {
      switch (vars.kind) {
        case "submit":
          return announcementsControllerSubmit(vars.id);
        case "archive":
          return announcementsControllerArchive(vars.id);
        case "pin":
          return announcementsControllerPin(vars.id);
        case "unpin":
          return announcementsControllerUnpin(vars.id);
        case "feature":
          return announcementsControllerFeature(vars.id);
        case "unfeature":
          return announcementsControllerUnfeature(vars.id);
      }
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateList();
    },
    onError: (err, vars) => {
      const context = vars.kind === "pin" || vars.kind === "unpin" ? "pin" : vars.kind === "feature" || vars.kind === "unfeature" ? "feature" : "transition";
      setActionError(humanizeAnnouncementError(err, context));
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) =>
      announcementsControllerReview(vars.id, { body: JSON.stringify(vars.body) }),
    onSuccess: async () => {
      await invalidateList();
      setReviewTarget(null);
    },
  });

  const requestPhotoUploadMutation = useMutation({
    mutationFn: async (vars: { id: string; contentType: string; sizeBytes: number }) =>
      announcementsControllerRequestPhotoUpload(vars.id, {
        body: JSON.stringify({ contentType: vars.contentType, sizeBytes: vars.sizeBytes }),
      }),
  });

  const confirmPhotoUploadMutation = useMutation({
    mutationFn: async (vars: { id: string; key: string }) =>
      announcementsControllerConfirmPhotoUpload(vars.id, { body: JSON.stringify({ key: vars.key }) }),
    onSuccess: async () => {
      await invalidateList();
    },
  });

  function handleTransition(kind: "submit" | "archive" | "pin" | "unpin" | "feature" | "unfeature", id: string) {
    transitionMutation.mutate({ kind, id });
  }

  function handleReviewSubmit(values: ReviewSubmitValues) {
    if (!reviewTarget) return;
    const body: Record<string, unknown> = { decision: values.decision };
    if (values.scheduledFor) body.scheduledFor = values.scheduledFor;
    if (values.rejectionReason) body.rejectionReason = values.rejectionReason;
    reviewMutation.mutate({ id: reviewTarget.id, body });
  }

  const tabs = ANNOUNCEMENT_TAB_KEYS.map((key) => ({
    key,
    label: tabLabel(key),
    count: counts[key],
  }));

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold">Announcements</h1>
          <p className="wc-muted">
            Station notices for the public site &amp; listeners. Every action is audit-logged.
          </p>
        </div>
        <Button
          data-testid="mod-ann-new"
          onClick={() => {
            setActionError(null);
            // A failed save leaves its error on the mutation; without a reset
            // the next dialog opens already showing the previous row's error.
            saveMutation.reset();
            setCreating(true);
          }}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New
        </Button>
      </header>

      <SegTabs
        className="mb-4 flex-wrap"
        testid="mod-ann-tabs"
        value={tab}
        onValueChange={(key) => setTab(key as AnnouncementTabKey)}
        tabs={tabs}
      />

      {(listQuery.isError || actionError) && (
        <div role="alert" className="mb-4 text-sm font-semibold text-destructive">
          {listQuery.isError ? getApiErrorMessage(listQuery.error) : actionError}
        </div>
      )}

      {listQuery.isPending ? (
        <div className="p-6 text-center wc-muted">Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div className="wc-card wc-card-pad text-center wc-muted" data-testid="mod-ann-empty">
          No announcements in this status yet.
        </div>
      ) : (
        <div className="wc-stack">
          {visibleItems.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              pinnedCount={pinnedCount}
              pinLimit={pinLimit}
              busy={transitionMutation.isPending}
              onEdit={() => {
                setActionError(null);
                saveMutation.reset();
                setFormTarget(announcement);
              }}
              onSubmit={() => handleTransition("submit", announcement.id)}
              onReview={() => {
                setActionError(null);
                reviewMutation.reset();
                setReviewTarget(announcement);
              }}
              onArchive={() => handleTransition("archive", announcement.id)}
              onTogglePin={() => handleTransition(announcement.isPinned ? "unpin" : "pin", announcement.id)}
              onToggleFeature={() =>
                handleTransition(announcement.featuredAt ? "unfeature" : "feature", announcement.id)
              }
            />
          ))}
          {/* Without this the list silently stopped at the page size and older
              announcements were simply unreachable — no pager, no indication
              anything had been cut off. */}
          {hasMore && (
            <div className="text-center">
              <Button
                variant="ghost"
                data-testid="mod-ann-load-more"
                disabled={listQuery.isFetching}
                onClick={() => setPageSize((size) => size + PAGE_SIZE)}
              >
                {listQuery.isFetching
                  ? "Loading…"
                  : `Load more (${items.length} of ${totalForTab})`}
              </Button>
            </div>
          )}
        </div>
      )}

      {creating && (
        <AnnouncementFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setCreating(false);
          }}
          onSave={(values) => saveMutation.mutate(values)}
          saving={saveMutation.isPending}
          saveError={saveMutation.isError ? getApiErrorMessage(saveMutation.error) : null}
        />
      )}

      {liveFormTarget && (
        <AnnouncementFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setFormTarget(null);
          }}
          editing={{
            id: liveFormTarget.id,
            title: liveFormTarget.title,
            content: liveFormTarget.content,
            photos: liveFormTarget.photos,
          }}
          onSave={(values) => saveMutation.mutate(values)}
          saving={saveMutation.isPending}
          saveError={saveMutation.isError ? getApiErrorMessage(saveMutation.error) : null}
          photoHandlers={{
            requestUpload: (body) =>
              requestPhotoUploadMutation.mutateAsync({ id: liveFormTarget.id, ...body }),
            confirmUpload: async (key) => {
              await confirmPhotoUploadMutation.mutateAsync({ id: liveFormTarget.id, key });
            },
          }}
        />
      )}

      {reviewTarget && (
        <ReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setReviewTarget(null);
          }}
          title={reviewTarget.title}
          onSubmit={handleReviewSubmit}
          pending={reviewMutation.isPending}
          error={reviewMutation.isError ? humanizeAnnouncementError(reviewMutation.error, "transition") : null}
        />
      )}
    </div>
  );
}

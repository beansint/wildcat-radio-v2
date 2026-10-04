# Schedule display and overtime-safe Studio handover

Issue: https://github.com/beansint/wildcat-radio-v2/issues/89
Companion: https://github.com/beansint/wildcat-radio-v2-backend/issues/114

AC-1: Every legacy show remains visible even with identical slots; staff receive overlap warnings and human-readable validation errors.
AC-2: Preserve minutes and calculate true uncovered rotation gaps on desktop/mobile.
AC-3: Refresh weekly/dated schedules after edits and poll public schedules every minute.
AC-4: Listen/player/landing/OS metadata use the backend showName, with truthful off-air/unavailable fallbacks.
AC-5: Studio queue and console state belong to the active episode; closing/turning over clears previous data.
AC-6: A continuing crew sees Start next show and explicitly triggers handover. Do not switch the outgoing scheduled show automatically, allowing intentional overtime. Existing different-crew Start my show remains available.
AC-7: Closing the editor restores focus to the original opener, or Add show if the opener was removed.

Backend merges first because frontend CI checks out backend dev. No deployment included.

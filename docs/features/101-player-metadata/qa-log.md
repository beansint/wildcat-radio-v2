# Verification evidence

Keeps cached manifest metadata only for already sounding audio, bounded60seconds from last successful response; failed polls neverextenddeadline. Statusservice remains UNAVAILABLE and freshplay/engagement controls stay gated. Initialfailedloads cannotinventURL; successfulOFF_AIR evidence ormatchingSocketOFF_AIR stillstops, recoverydoesnotreattachsameURL. RealChromium nativePCM180secondfixture (decoded currentTime advances, no play/paused/time stubs), controlledmetadata and blockedSockettransport: baseline2outage cases stoppedworking audio; fixed4browser casespassedtwice (briefoutage/recovery, repeatedfailuredeadline, initialfailure/manualkeyboardintent, freshoffair). Full lint/type278unit tests passed (4existingwarnings). Testforcesnativecapabilityfallback; no liveHLS, Safari/iOS background, physicalbooth/provider/deployment proof. Absolute timer re-evaluates overdue deadline on error, normalbrowserexecution required.

Independent review: pending after draft PR creation. No deployment or physical-device proof.

## Review correction

Independent post-creation review found retained LIVE metadata still enabled the global reaction and Live badges. Added failing LIVE outage case:4passed1failed before correction. Freshness now gates global reactions, Live badges/up-next and homepage live evidence; sounding audio remains retained only for the original bounded grace. Final5browser cases pass twice with real Chromium PCM media; lint/typecheck/full278unit pass. Fixture media origin derives from PLAYWRIGHT_BASE_URL. No real HLS/provider/physical proof. Independent re-review pending.

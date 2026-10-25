# Realtime recovery (#148)

The persistent player receives the backend's complete `stream:manifest` snapshot on connection, transitions and its shared 15-second heartbeat. It performs an initial HTTP read, resynchronizes on reconnect/focus, and cancels older reads when a valid push arrives. Partial `stream:status` messages supply presence counts only; they cannot override authoritative playback or Studio metadata.

Healthy delivery has no recurring manifest or controls HTTP interval. A missing manifest for 30–33 seconds starts HTTP recovery; disconnect starts recovery after 1–2 seconds. Recovery sequences back off with jitter from 15 to 60 seconds, with one sequence at a time and a 10-second request deadline. Existing retry, status availability and absolute 60-second last-good audio rules remain in force. Initial/failed controls reads retry with bounded jitter even if the socket remains connected.

A status subscription never joins listener presence. Audible playback alone joins that room. Listening, engagement and Studio joins retry refused/lost acknowledgements on the same transport; successful admission precedes the recovery snapshot. Cancellation stops stale room work. SnapshotRecovery still preserves events that arrive during reads. Async actions also carry an invocation scope so a changed account/episode cannot receive an old action's updates.

The provider exposes its successful manifest observation count through StreamContext. Ended-episode recovery therefore works with the separate identity-scoped page QueryClient introduced by #147, including identical same-millisecond manifests and missed `episode:started` events. This is local observation state; the wire DTO has no new revision/epoch fields.

The separate backportable socket identity fix keeps handshake ownership outside remounted pages. It observes settled Better Auth session/user/role data, rotates an existing transport on changes, and creates no idle transport. Audio and the status provider remain persistent.

Private submission history also has no healthy periodic HTTP read. The quiet `queue:mine-changed {episodeId}` event invalidates the owner-scoped persisted history, including CLOSED outcomes and receipt opt-outs, without a toast. The initial hint has `episodeId:null`, including while OFF_AIR; it establishes private-channel readiness only after backend user-room admission and session revalidation, and refreshes whichever owner history is active. Action hints carry their episode ID and only refresh matching history. A tiny per-socket WeakSet preserves an early admission hint until the owner view mounts and resets on every connection boundary. User-room readiness persists across healthy episode turnover. Until readiness is proven, or while a history read fails, bounded jittered recovery remains active even on a connected transport. Ended history uses an initial/final read, focus recovery and quiet invalidation. Owner/episode cleanup cancels old reads.

Deploy backend #210 before the web where possible. An older server cannot establish the new private readiness signal; the web continues bounded fallback instead of falsely assuming healthy delivery.

No deployment, production load, provider credentials, broker or Redis changes are included. Studio attendance cadence remains outside this issue.

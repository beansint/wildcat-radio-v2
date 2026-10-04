# fix: refresh chat identity after email verification

Socket reconnect key includes only userId so verified same-user session stays stale.

- AC-1: Reconnect/refresh lease after verification, class/role/session identity changes.
- AC-2: No duplicate sockets/messages.
- AC-3: Verification in another tab unlocks chat without full reload.

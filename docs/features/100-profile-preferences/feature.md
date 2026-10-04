# fix: preserve profile preferences and clear demographics

Missing GET fields hydrate opt-ins; unrelated save overwrites preferences; blanks are omitted.

- AC-1: Use corrected backend profile contract.
- AC-2: Save reload and unrelated edit retain opt-outs.
- AC-3: Clear nullable fields explicitly and separate unrelated preference writes.

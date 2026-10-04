# fix: preserve announcement body line breaks

Editor promises preserved line breaks but normal paragraphs collapse single newline.

- AC-1: Public body preserves single and blank line formatting.
- AC-2: Plain text stays escaped.
- AC-3: Browser asserts real rendered layout, not string transform only.

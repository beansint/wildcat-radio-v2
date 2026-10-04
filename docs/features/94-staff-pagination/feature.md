# fix: page through the complete staff announcement list

Load more increases pageSize beyond backend100 cap without paging.

- AC-1: Page/cursor through all announcements and retain tab counts.
- AC-2: No duplicate/missing rows across load more and lifecycle refresh.
- AC-3: Golden and >100-row browser edge tests.

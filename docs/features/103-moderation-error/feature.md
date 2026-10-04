# fix: distinguish moderation queue failures from empty state

API outage/session failure is rendered as Nothing in the queue.

- AC-1: Explicit error/retry state before empty branch.
- AC-2: Successful recovery renders actual backlog.
- AC-3: Expired auth is not reported as zero workload.

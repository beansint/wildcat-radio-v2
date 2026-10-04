# fix: preserve playback across temporary metadata failure

Failed background manifest refetch pauses healthy direct audio and never resumes.

- AC-1: Keep bounded last-good metadata for already playing audio.
- AC-2: Initial failure and genuine off-air still behave truthfully.
- AC-3: Recovery and prolonged stale evidence tested with controlled media.

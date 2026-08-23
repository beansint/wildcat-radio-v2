export class PlayAttemptTracker {
  private generation = 0;

  start(): { isCurrent: () => boolean } {
    const generation = ++this.generation;
    return { isCurrent: () => generation === this.generation };
  }

  cancel(): void {
    this.generation += 1;
  }
}

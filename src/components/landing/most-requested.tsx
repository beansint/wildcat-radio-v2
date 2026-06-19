// TODO(M5/M6): wire to <api> — currently static mock

const tracks = [
  { rank: 1, title: "Blinding Lights", artist: "The Weeknd", reqs: 28, rankClass: "text-maroon" },
  { rank: 2, title: "Golden Hour", artist: "JVKE", reqs: 24, rankClass: "text-maroon" },
  { rank: 3, title: "Ere", artist: "Juan Karlos", reqs: 19, rankClass: "text-maroon" },
  { rank: 4, title: "Mundo", artist: "IV of Spades", reqs: 17, rankClass: "wc-muted" },
] as const;

export function MostRequested() {
  return (
    <section className="wc-container py-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">Most requested this week</h2>
        <a href="#" className="text-sm font-semibold text-maroon">View all →</a>
      </div>
      <div className="wc-card divide-y">
        {tracks.map((track) => (
          <div key={track.rank} className="wc-card-pad flex items-center gap-3">
            <span className={`text-2xl font-extrabold ${track.rankClass} w-7 tnum`}>
              {track.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{track.title}</div>
              <div className="text-sm wc-muted truncate">{track.artist}</div>
            </div>
            <span className="wc-chip-ghost tnum">{track.reqs} reqs</span>
          </div>
        ))}
      </div>
    </section>
  );
}

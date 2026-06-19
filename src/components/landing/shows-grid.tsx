// TODO(M5/M6): wire to <api> — currently static mock

const shows = [
  { cover: "wc-cover-1", initials: "AV", name: "Afternoon Vibes", djs: "DJ Mara · DJ Cha" },
  { cover: "wc-cover-2", initials: "DH", name: "Drive Home", djs: "DJ Ben" },
  { cover: "wc-cover-3", initials: "MG", name: "Morning Grind", djs: "DJ Natz" },
  { cover: "wc-cover-rotation", initials: "LL", name: "Late Night Lo-fi", djs: "Station rotation" },
] as const;

export function ShowsGrid() {
  return (
    <section className="wc-container py-2 pb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">Shows</h2>
        <a href="#" className="text-sm font-semibold text-maroon">All shows →</a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {shows.map((show) => (
          <a
            key={show.initials}
            href="#"
            className="wc-card wc-card-i hover:shadow-lg transition-shadow"
          >
            <div className={`wc-cover ${show.cover} aspect-square`}>
              <span className="init">{show.initials}</span>
            </div>
            <div className="p-3">
              <div className="font-bold truncate">{show.name}</div>
              <div className="text-xs wc-muted truncate">{show.djs}</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

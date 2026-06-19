// TODO(M5/M6): wire to <api> — currently static mock

export function NowNext() {
  return (
    <section className="wc-container py-2">
      <h2 className="text-lg font-extrabold mb-3">Now &amp; next</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {/* On air */}
        <div className="wc-card wc-card-pad flex items-center gap-3">
          <div className="wc-cover wc-cover-1 rounded-lg w-16 h-16 flex-none">
            <span className="init">AV</span>
          </div>
          <div className="min-w-0">
            <span className="wc-badge-live text-[.65rem]">
              <span className="dot"></span>On air
            </span>
            <div className="font-bold truncate mt-1">Afternoon Vibes</div>
            <div className="text-sm wc-muted truncate">DJ Mara · 2:00–4:00 PM</div>
          </div>
        </div>

        {/* Up next */}
        <div className="wc-card wc-card-pad flex items-center gap-3">
          <div className="wc-cover wc-cover-2 rounded-lg w-16 h-16 flex-none">
            <span className="init">DH</span>
          </div>
          <div className="min-w-0">
            <span className="wc-chip-ghost text-[.65rem]">Up next</span>
            <div className="font-bold truncate mt-1">Drive Home</div>
            <div className="text-sm wc-muted truncate">DJ Ben · 4:00–6:00 PM</div>
          </div>
        </div>
      </div>
    </section>
  );
}

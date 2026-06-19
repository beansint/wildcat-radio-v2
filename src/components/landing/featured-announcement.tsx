// TODO(M5/M6): wire to <api> — currently static mock

export function FeaturedAnnouncement() {
  return (
    <section className="wc-container py-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">Featured</h2>
        <a href="#" className="text-sm font-semibold text-maroon">All news →</a>
      </div>
      <a href="#" className="wc-card block md:flex hover:shadow-lg transition-shadow">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/template-social-congratulations.jpg"
          alt=""
          className="md:w-72 w-full h-48 md:h-auto object-cover"
        />
        <div className="wc-card-pad flex flex-col justify-center">
          <span className="wc-chip-ghost self-start mb-2">📣 Public</span>
          <h3 className="text-xl font-extrabold mb-1">We are so PROUD of you!</h3>
          <p className="wc-muted">
            Congratulations to Glysa C. Nadado — CESAFI Bangga sa Balak College Division Champion.
            Catch her story on this week&apos;s show.
          </p>
          <span className="text-sm font-semibold text-maroon mt-3">Read more →</span>
        </div>
      </a>
    </section>
  );
}

import Image from "next/image";
import { TopNav } from "@/components/layout/top-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Footer } from "@/components/layout/footer";
import { LiveStatusCard } from "@/components/stream/live-status-card";

export default function LandingPage() {
  return (
    <>
      <TopNav />

      <main className="pb-28">
        {/* ====== HERO ====== */}
        <section className="wc-grad-maroon text-white relative overflow-hidden">
          {/* Dot-grid texture overlay */}
          <div className="absolute inset-0 wc-pattern-maroon opacity-25" aria-hidden="true" />

          <div className="wc-container relative py-8 md:py-14">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* Left: wordmark + copy */}
              <div>
                <Image
                  src="/brand/logo-wordmark-lockup.png"
                  alt="Wildcat Radio"
                  width={280}
                  height={112}
                  className="h-20 md:h-28 w-auto mb-5 drop-shadow"
                  priority
                />
                <p className="text-white/85 max-w-md text-lg">
                  The campus radio station of the Cebu Institute of Technology –
                  University. Tune in, request a song, join the room.
                </p>
              </div>

              {/* Right: live status card */}
              <LiveStatusCard />
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <BottomNav />
    </>
  );
}

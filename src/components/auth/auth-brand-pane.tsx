/**
 * Auth split-layout brand pane (left side on desktop, top on mobile).
 * variant="login"    — "The booth is live" + now-playing card
 * variant="register" — "More than a listener" + benefits checklist
 *
 * 1:1 from docs/frontend-design-basis-prototype/public/login.html and register.html
 */
import type React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Users, Music, MessageCircle, Heart, Bookmark, Sparkles } from 'lucide-react';

interface AuthBrandPaneProps {
  variant: 'login' | 'register';
}

export function AuthBrandPane({ variant }: AuthBrandPaneProps) {
  return (
    <aside className="wc-auth-brand" aria-label="Why join Wildcat Radio">
      {/* Logo link — alt="" because the adjacent wordmark text already labels the link */}
      <Link href="/" className="flex items-center gap-2.5 w-max">
        <Image
          src="/brand/logo-mascot-mark.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10"
          priority
        />
        <span className="font-extrabold text-lg tracking-tight">
          Wildcat <span className="text-gold">Radio</span>
        </span>
      </Link>

      {/* Body */}
      <div className="lg:my-auto max-w-md">
        {variant === 'login' ? <LoginBody /> : <RegisterBody />}
      </div>

      <p className="text-white/45 text-xs hidden lg:block">
        Wildcat Radio · CIT-U Campus Radio
      </p>
    </aside>
  );
}

/* ---------- LOGIN variant ---------- */
function LoginBody() {
  return (
    <>
      <h2 className="text-2xl lg:text-[2.6rem] font-extrabold leading-[1.1] mb-5">
        The booth is live.<br />Pick up where you left off.
      </h2>

      {/* Now-playing card — desktop / tablet */}
      <div className="wc-auth-glass p-3.5 hidden md:block max-w-sm mb-5">
        <div className="flex items-center gap-3">
          <div className="wc-art rounded-xl w-12 h-12 flex-none" />
          <div className="min-w-0 flex-1">
            <div className="text-[.62rem] font-bold uppercase tracking-wide text-white/55">
              On air
            </div>
            <div className="font-extrabold truncate">Afternoon Vibes</div>
            <div className="text-white/65 text-sm truncate">
              &ldquo;Golden Hour&rdquo; — JVKE · DJ Mara
            </div>
          </div>
          <span className="eq text-gold">
            <i /><i /><i /><i />
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-white/80 font-semibold">
        <Users className="w-4 h-4 text-gold" aria-hidden="true" />
        <span className="tnum">142</span> wildcats listening right now
      </div>
    </>
  );
}

/* ---------- REGISTER variant ---------- */
interface Benefit {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  hideSm?: boolean;
}

const BENEFITS: Benefit[] = [
  { Icon: Music,         title: 'Request songs to the booth',  sub: 'Drop a track and hear it on air.' },
  { Icon: MessageCircle, title: 'Jump into the live chat',     sub: 'Makipag-tambay with DJs and the barkada.' },
  { Icon: Heart,         title: 'Vote in polls & send hype',   sub: 'Shape the show in real time.' },
  { Icon: Bookmark,      title: 'Save your shows & DJs',       sub: 'Never miss your regulars.',                  hideSm: true },
  { Icon: Sparkles,      title: 'Listener-only perks',         sub: 'Shoutouts, giveaways, request priority.',    hideSm: true },
];

function RegisterBody() {
  return (
    <>
      <h2 className="text-2xl lg:text-[2.5rem] font-extrabold leading-[1.1] mb-5">
        More than a listener.<br />Be part of the show.
      </h2>

      <ul className="space-y-3.5 mb-6">
        {BENEFITS.map(({ Icon, title, sub, hideSm }) => (
          <li
            key={title}
            className={`flex items-start gap-3${hideSm ? ' hidden sm:flex' : ''}`}
          >
            <span className="wc-auth-check">
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div>
              <div className="font-bold leading-tight">{title}</div>
              <div className="text-white/65 text-sm">{sub}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <div className="wc-auth-avatars flex">
          <span className="wc-mono wc-mono-1">J</span>
          <span className="wc-mono wc-mono-3">A</span>
          <span className="wc-mono wc-mono-4">R</span>
          <span className="wc-mono wc-mono-5">M</span>
        </div>
        <span className="text-sm text-white/75">
          <span className="font-bold text-white tnum">1,200+</span> wildcats already tuned in
        </span>
      </div>
    </>
  );
}

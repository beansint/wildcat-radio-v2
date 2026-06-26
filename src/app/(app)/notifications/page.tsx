"use client";

/**
 * /notifications — 1:1 static shell from docs/frontend-design-basis-prototype/listener/notifications.html
 * Live receipts are M3/M4 — this is the empty-state + placeholder items.
 */
import Link from 'next/link';
import { Music, Radio, Megaphone, Scale, CheckCheck } from 'lucide-react';

interface NotifItem {
  id: number;
  kind: 'req' | 'air' | 'info' | 'scale';
  title: string;
  age: string;
  href?: string;
  linkLabel?: string;
}

const PLACEHOLDER_ITEMS: NotifItem[] = [
  {
    id: 1,
    kind: 'req',
    title: 'Your request "Ere — Juan Karlos" was queued by DJ Mara',
    age: '2h ago',
  },
  {
    id: 2,
    kind: 'air',
    title: '📣 Your dedication was read on air!',
    age: '3h ago',
    href: '#',
    linkLabel: 'View show →',
  },
  {
    id: 3,
    kind: 'info',
    title: 'New announcement: DJ recruitment week',
    age: '1d ago',
    href: '#',
    linkLabel: 'Read more →',
  },
  {
    id: 4,
    kind: 'scale',
    title: 'Your appeal was reviewed — mute reduced',
    age: '2d ago',
    href: '#',
    linkLabel: 'View standing →',
  },
  {
    id: 5,
    kind: 'req',
    title: 'Your request "Mundo — IV of Spades" joined the queue',
    age: '3d ago',
  },
  {
    id: 6,
    kind: 'info',
    title: 'New announcement: Acquaintance Party live broadcast this Friday',
    age: '5d ago',
    href: '#',
    linkLabel: 'Read more →',
  },
];

const KIND_CLASSES: Record<string, string> = {
  req:   'wc-ti-req',
  air:   'wc-ti-air',
  info:  'wc-ti-info',
  scale: 'wc-ti-info',
};

function KindIcon({ kind }: { kind: NotifItem['kind'] }) {
  const icons: Record<NotifItem['kind'], React.ReactNode> = {
    req:   <Music   className="w-4 h-4" aria-hidden="true" />,
    air:   <Radio   className="w-4 h-4" aria-hidden="true" />,
    info:  <Megaphone className="w-4 h-4" aria-hidden="true" />,
    scale: <Scale   className="w-4 h-4" aria-hidden="true" />,
  };
  return <span className={`wc-typeicon ${KIND_CLASSES[kind]}`}>{icons[kind]}</span>;
}

export default function NotificationsPage() {
  return (
    <main className="wc-container py-6 pb-28" style={{ background: 'var(--muted)' }}>
      <h1 className="text-2xl font-extrabold mb-4">Notifications</h1>

      <div className="wc-stack">
        {PLACEHOLDER_ITEMS.map((item) => (
          <div key={item.id} className="wc-card wc-card-pad flex items-start gap-3">
            <KindIcon kind={item.kind} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{item.title}</div>
              <div className="text-sm wc-muted tnum mt-0.5">{item.age}</div>
              {item.href && (
                <Link href={item.href} className="text-sm font-semibold text-maroon inline-block mt-1">
                  {item.linkLabel}
                </Link>
              )}
            </div>
          </div>
        ))}

        {/* Empty-state card — always shown at bottom (live receipts arrive in M3/M4) */}
        <div
          className="wc-card wc-card-pad flex items-center gap-3"
          style={{ background: 'var(--muted)' }}
        >
          <CheckCheck className="w-5 h-5 wc-muted flex-none" aria-hidden="true" />
          <div className="text-sm wc-muted">
            That&apos;s everything — your next on-air receipt shows up here.
          </div>
        </div>
      </div>
    </main>
  );
}

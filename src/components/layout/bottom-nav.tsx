"use client";

/**
 * Mobile-only bottom navigation bar.
 * Uses wc-bottomnav class. Sits at bottom:64px to clear the GlobalPlayer (z-index:60).
 * Hidden on md+ screens.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Radio, CalendarDays, Megaphone, User } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',              label: 'Home',     Icon: Home },
  { href: '/listen',        label: 'Listen',   Icon: Radio },
  { href: '#',              label: 'Schedule', Icon: CalendarDays },
  { href: '#',              label: 'News',     Icon: Megaphone },
  { href: '/profile',       label: 'You',      Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    if (href === '#') return false;
    return pathname.startsWith(href);
  }

  return (
    /* md:hidden — desktop uses top nav; bottom:64px clears the GlobalPlayer */
    <nav
      className="wc-bottomnav md:hidden"
      style={{ bottom: '64px' }}
      aria-label="Bottom navigation"
    >
      {NAV_ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={label}
          href={href}
          className={isActive(href) ? 'active' : ''}
          aria-current={isActive(href) ? 'page' : undefined}
          aria-label={label}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

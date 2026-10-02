"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LayoutDashboard, LogOut, Shield, ShieldCheck, User } from "lucide-react";
import { signOut, type SessionUser } from "@/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountMenuProps {
  user: SessionUser;
  staffPortal: string | null;
}

/**
 * Avatar quick-access menu. The avatar used to be a bare link to /profile,
 * which hid sign-out and the settings surfaces two clicks deep. Radix gives
 * the menu keyboard support (Enter/Space/Arrow keys open it, Esc closes and
 * returns focus to the avatar) without hand-rolling it.
 */
export function AccountMenu({ user, staffPortal }: AccountMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="wc-avatar h-9 w-9 block flex-none cursor-pointer rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-maroon"
          aria-label={`Account menu${user.handle ? ` (@${user.handle})` : ""}`}
          data-testid="account-menu-trigger"
          style={user.image ? { backgroundImage: `url(${user.image})`, backgroundSize: "cover" } : undefined}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" data-testid="account-menu">
        <DropdownMenuLabel className="min-w-0">
          <div className="font-bold truncate">{user.name || "Listener"}</div>
          <div className="text-xs text-muted-foreground truncate">
            {user.handle ? `@${user.handle}` : user.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile" data-testid="account-menu-profile">
              <User aria-hidden="true" />
              Profile &amp; settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/notifications" data-testid="account-menu-notifications">
              <Bell aria-hidden="true" />
              Notifications
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/profile/standing" data-testid="account-menu-standing">
              <ShieldCheck aria-hidden="true" />
              Account standing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/my-data" data-testid="account-menu-my-data">
              <Shield aria-hidden="true" />
              Your data
            </Link>
          </DropdownMenuItem>
          {/* The header's Staff console button is hidden below md; this keeps
              the staff entry one tap away on tablets too. */}
          {staffPortal && (
            <DropdownMenuItem asChild className="md:hidden">
              <Link href={staffPortal} data-testid="account-menu-staff">
                <LayoutDashboard aria-hidden="true" />
                Staff console
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void handleSignOut()}
          data-testid="account-menu-signout"
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Auth route-group layout.
 * Renders no TopNav or MobileDrawer — auth pages own their full viewport via wc-auth-grid.
 * Root layout already provides html / body / QueryProvider / GlobalPlayer.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

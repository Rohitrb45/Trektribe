export const tabPaths = { Explore: '/', Community: '/community', Trips: '/trips', Profile: '/profile' } as const;
type Tab = keyof typeof tabPaths;
export function resolveRoute(pathname: string): { tab: Tab; trailId?: string; notFound?: boolean } {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const [tab, target] of Object.entries(tabPaths)) {
    if (target === path) return { tab: tab as Tab };
  }
  // AuthSession completes the provider callback; never treat query parameters as routes.
  if (path === '/auth') return { tab: 'Explore' };
  const match = /^\/trails\/([^/]+)$/.exec(path);
  if (match) {
    try {
      const id = decodeURIComponent(match[1]);
      if (/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return { tab: 'Explore', trailId: id };
    } catch { /* malformed URL is an unavailable page */ }
  }
  return { tab: 'Explore', notFound: true };
}

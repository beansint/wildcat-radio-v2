/** Host-only configuration shared by CSP and Next image patterns. */
export function resolveContentOrigin(host: string): {
  origin: string; protocol: 'http' | 'https'; hostname: string; port: string;
} {
  const fail = (): never => { throw new Error('Invalid content host: supply an exact hostname and optional port'); };
  // Reject URL syntax, credentials, wildcard hosts and CSP/header delimiters
  // before interpolating any configuration into a response header.
  if (!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::[0-9]+)?$/i.test(host)) fail();
  let url: URL;
  try { url = new URL(`https://${host}`); } catch { return fail(); }
  // Reject alternative numeric-IP spellings and URL parser normalization.
  if (url.host !== host.toLowerCase() || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail();
  const protocol = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? 'http' : 'https';
  url.protocol = protocol + ':';
  return { origin: url.origin, protocol, hostname: url.hostname, port: url.port };
}

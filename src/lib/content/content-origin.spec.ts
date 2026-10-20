import { describe, expect, it } from 'vitest';
import { resolveContentOrigin } from './content-origin';

describe('content origin configuration', () => {
  it('keeps remote media and upload origins HTTPS with exact host and port', () => {
    expect(resolveContentOrigin('bucket.r2.example:8443')).toEqual({ origin: 'https://bucket.r2.example:8443', protocol: 'https', hostname: 'bucket.r2.example', port: '8443' });
  });

  it.each(['127.0.0.1', 'localhost', '[::1]'])('allows HTTP for exact loopback %s and separates its port for Next images', (hostname) => {
    expect(resolveContentOrigin(`${hostname}:55991`)).toEqual({ origin: `http://${hostname}:55991`, protocol: 'http', hostname, port: '55991' });
  });

  it.each(['localhost.example', '127.0.0.1.example', '192.168.1.1'])('keeps lookalikes and non-loopback %s on HTTPS', (hostname) => {
    expect(resolveContentOrigin(hostname).origin).toBe(`https://${hostname}`);
  });

  it.each(['', 'https://bucket.example', 'user:secret@bucket.example', 'bucket.example/path', 'bucket.example?query=1', 'bucket.example#fragment', 'bucket.example;img-src', 'bucket.example\r\nX-Injected:true', 'bucket.example img-src *', '*.example', '127.1:55991', '2130706433:55991', 'bucket.example:99999'])('rejects unsafe host-only value %j', (host) => {
    expect(() => resolveContentOrigin(host)).toThrow('Invalid content host');
  });
});

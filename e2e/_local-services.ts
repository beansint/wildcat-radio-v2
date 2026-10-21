import { expect, type APIRequestContext } from '@playwright/test';
import { assertLocalPlaywrightEnvironment } from '../src/lib/tooling/playwright-safety';

/** These cases fail closed when the local S3/encoder fixture is absent. */
export async function requireLocalServices(request: APIRequestContext) {
  assertLocalPlaywrightEnvironment(process.env);
  const delivery = process.env.PLAYWRIGHT_LOCAL_SERVICES_URL;
  const endpoint = process.env.R2_ENDPOINT;
  for (const [name, value] of Object.entries({ PLAYWRIGHT_LOCAL_SERVICES_URL: delivery, R2_ENDPOINT: endpoint })) {
    const url = new URL(value || 'about:blank');
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
      throw new Error(`${name} must name the guarded loopback local-services fixture`);
    }
  }
  expect(process.env.STREAM_PUBLIC_URL).toBe(delivery);
  expect(process.env.R2_BUCKET).toBe('wildcat-browser-e2e');
  expect(process.env.R2_ACCESS_KEY_ID).toBe('synthetic-local-only');
  expect(process.env.R2_SECRET_ACCESS_KEY).toBe('synthetic-local-only');
  expect(process.env.SKIP_R2_E2E, 'storage coverage must run, never opt out').not.toBe('1');
  const response = await request.get(`${delivery}/__health`);
  expect(response.ok(), 'start e2e/local-services.py before running browser tests').toBe(true);
  const health = await response.json() as {
    service: string; ready: boolean; s3Endpoint: string; bucket: string;
    playlistGets: number; segmentGets: number; objectGets: number;
  };
  expect(health.service).toBe('wildcat-local-browser-services-v1');
  expect(health.ready).toBe(true);
  expect(health.s3Endpoint).toBe(endpoint);
  expect(health.bucket).toBe(process.env.R2_BUCKET);
  return { delivery: delivery!, endpoint: endpoint!, health };
}

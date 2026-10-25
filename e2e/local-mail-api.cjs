/* eslint-disable @typescript-eslint/no-require-imports -- Node-only local test bootstrap loads the sibling compiled Nest application. */
/** Local browser server: real Nest/Better Auth/DB, captured external email boundary.
 * Never use in deployment. Captures contain synthetic short-lived test credentials;
 * keep the file under .agent and remove it after stopping the owned test server.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const backend = path.resolve(process.env.WILDCAT_BACKEND_DIR || '../wildcat-radio-v2-backend');
const req = createRequire(path.join(backend, 'apps/api/package.json'));
const db = new URL(process.env.DATABASE_URL || '');
const web = new URL(process.env.PLAYWRIGHT_BASE_URL || '');
const api = new URL(process.env.PLAYWRIGHT_API_URL || '');
const capture = path.resolve(process.env.AUTH_EMAIL_CAPTURE_PATH || '');
const local = url => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (process.env.NODE_ENV !== 'test' || !local(db) || db.port !== '55432' || db.search || db.hash ||
    !/(^|_)(test|e2e)(_|$)/.test(db.pathname) || !local(web) || !local(api) ||
    web.protocol !== 'http:' || api.protocol !== 'http:' ||
    !capture.split(path.sep).includes('.agent') || !process.env.AUTH_EMAIL_CAPTURE_PATH) {
  throw Error('Local mail API requires explicit isolated loopback test targets and .agent capture');
}
const syntheticEnv = { ...process.env, RESEND_API_KEY: 're_local_capture_only', AUTH_EMAIL_FROM: 'Wildcat test <local@example.invalid>' };
fs.mkdirSync(path.dirname(capture), { recursive: true });
const accepted = new Map();
async function captureFetch(url, options) {
  if (url !== 'https://api.resend.com/emails') throw Error('Unexpected email transport target');
  const body = JSON.parse(options.body);
  const idempotencyKey = options.headers['Idempotency-Key'];
  if (!idempotencyKey) throw Error('Mail capture requires provider idempotency');
  if (accepted.has(idempotencyKey)) return Response.json({ id: accepted.get(idempotencyKey) });
  const id = `local-capture-${accepted.size + 1}`;
  const faultPath = `${capture}.fault`;
  const status = fs.existsSync(faultPath) ? Number(fs.readFileSync(faultPath, 'utf8').trim()) : 200;
  if (status !== 200) return Response.json({ message: 'Synthetic provider failure' }, { status });
  accepted.set(idempotencyKey, id);
  fs.appendFileSync(capture, JSON.stringify({ id, idempotencyKey, to: body.to, subject: body.subject, text: body.text, acceptedAt: new Date().toISOString() }) + '\n');
  return Response.json({ id });
}
async function main() {
  req('reflect-metadata');
  const { Test } = req('@nestjs/testing');
  const { ValidationPipe } = req('@nestjs/common');
  const express = req('express');
  const helmet = req('helmet');
  const { toNodeHandler } = await import(pathToFileURL(req.resolve('better-auth/node')).href);
  const dist = path.join(backend, 'apps/api/dist');
  const { AppModule } = req(path.join(dist, 'app.module.js'));
  const { AuthEmailService, AUTH_EMAIL_ENV } = req(path.join(dist, 'auth/auth-email.service.js'));
  const { AUTH_INSTANCE } = req(path.join(dist, 'auth/auth.tokens.js'));
  const { AUTH_CLIENT_IP_HEADER } = req(path.join(dist, 'auth/auth.factory.js'));
  const { BoundedIoAdapter } = req(path.join(dist, 'bounded-io.adapter.js'));
  const testingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthEmailService).useValue(new AuthEmailService(syntheticEnv, captureFetch))
    .overrideProvider(AUTH_EMAIL_ENV).useValue(syntheticEnv)
    .compile();
  const app = testingModule.createNestApplication({ bodyParser: false });
  const inst = app.getHttpAdapter().getInstance();
  const origins = (process.env.CORS_ORIGINS || web.origin).split(',').map(x => x.trim());
  inst.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  inst.use('/api/auth', (request, response, next) => {
    const origin = request.headers.origin;
    if (origin && origins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Cookie');
    }
    if (request.method === 'OPTIONS') { response.sendStatus(204); return; }
    request.headers[AUTH_CLIENT_IP_HEADER] = request.ip || '';
    next();
  });
  inst.all('/api/auth/*splat', toNodeHandler(app.get(AUTH_INSTANCE)));
  inst.use(express.json({ limit: '100kb' }));
  inst.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 1000 }));
  app.useWebSocketAdapter(new BoundedIoAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(Number(api.port), '127.0.0.1');
  console.log('Local mail API ready; provider transport captured locally');
}
main().catch(error => { console.error('Local mail API failed:', error.message); process.exitCode = 1; });

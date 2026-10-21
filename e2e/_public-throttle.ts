import { spawn } from 'node:child_process';
import path from 'node:path';
import { BACKEND_DIR } from './_fixtures';

/** Isolated local HTTP server: actual controller/guard policy, stubbed read payload. */
export async function startPublicThrottleHarness(): Promise<{ baseURL: string; close(): Promise<void> }> {
  const child = spawn(process.execPath, [path.join(BACKEND_DIR, 'apps/api/test/public-throttle-harness.cjs')], {
    cwd: path.join(BACKEND_DIR, 'apps/api'),
    // Import production presets before any NODE_ENV-aware module executes.
    // Do not inherit API credentials, database URLs, or .env configuration.
    env: { NODE_ENV: 'production', PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  let diagnostics = '';
  child.stdout?.on('data', chunk => { diagnostics += String(chunk); });
  child.stderr?.on('data', chunk => { diagnostics += String(chunk); });
  try {
    const baseURL = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Public throttle harness startup timed out: ${diagnostics}`)), 15_000);
      child.once('message', message => {
        clearTimeout(timer);
        const ready = message as { ready?: boolean; baseURL?: string };
        if (!ready.ready || !ready.baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(ready.baseURL)) {
          reject(new Error('Invalid loopback throttle harness readiness message'));
        } else resolve(ready.baseURL);
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Public throttle harness exited (${code}): ${diagnostics}`));
      });
    });
    return {
      baseURL,
      close: () => new Promise<void>(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
        const timer = setTimeout(() => child.kill(), 5_000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        if (child.connected) child.send('close');
        else child.kill();
      }),
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

import { execFileSync } from 'node:child_process';
import { playwrightSubprocessEnvironment } from '../src/lib/tooling/playwright-safety';

/** SQL fixtures share the same explicit, local database guard as the runner. */
export function fixtureSql(query: string): string {
  const env = playwrightSubprocessEnvironment(process.env);
  return execFileSync(process.env.PSQL_EXECUTABLE || 'psql', [
    process.env.DATABASE_URL!, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query,
  ], { encoding: 'utf8', env }).trim();
}

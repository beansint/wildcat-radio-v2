import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('eslint-config-next'));
const pluginPath = nextRequire.resolve('@next/eslint-plugin-next');
const plugin = nextRequire('@next/eslint-plugin-next');
const { getRootDirs } = require(join(dirname(pluginPath), 'utils/get-root-dirs.js'));
const root = mkdtempSync(join(tmpdir(), 'wildcat-eslint-glob-'));
for (const name of ['alpha', 'beta']) {
  mkdirSync(join(root, 'apps', name, 'pages'), { recursive: true });
  writeFileSync(join(root, 'apps', name, 'pages/home.tsx'), 'export default function Home() { return null; }');
}
writeFileSync(join(root, 'apps', 'ordinary-file'), 'not a directory');
afterAll(() => rmSync(root, { recursive: true, force: true }));
const resolveRoots = (rootDir?: unknown) => getRootDirs({ cwd: root, settings: { next: { rootDir } } });
// tinyglobby returns slash-normalized paths; compare path identities on Windows too.
const normalizePath = (path: string) => path.replaceAll("\\", "/");
const normalizedRoots = (rootDir?: unknown): string[] => resolveRoots(rootDir).map(normalizePath);

describe('Next ESLint root discovery with the scoped tinyglobby replacement', () => {
  it('preserves the ordinary cwd default', () => {
    expect(resolveRoots()).toEqual([root]);
  });

  it('finds directories only through wildcard and brace patterns', () => {
    const expected = ['alpha', 'beta'].map(name => normalizePath(join(root, 'apps', name))).sort();
    expect(normalizedRoots(join(root, 'apps', '*')).sort()).toEqual(expected);
    expect(normalizedRoots(join(root, 'apps', '{alpha,beta}')).sort()).toEqual(expected);
  });

  it('preserves multiple roots, missing roots and normalized backslashes', () => {
    const alpha = join(root, 'apps', 'alpha');
    const beta = join(root, 'apps', 'beta');
    expect(normalizedRoots([alpha, beta, 42])).toEqual([alpha, beta].map(normalizePath));
    expect(resolveRoots(join(root, 'missing', '*'))).toEqual([]);
    expect(normalizedRoots(alpha.replaceAll('/', '\\'))).toEqual([normalizePath(alpha)]);
  });

  it('keeps the actual Next internal-link lint rule effective for discovered pages', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['**/*.jsx'],
        plugins: { '@next/next': plugin },
        settings: { next: { rootDir: join(root, 'apps', '*') } },
        languageOptions: { parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } } },
        rules: { '@next/next/no-html-link-for-pages': 'error' },
      }],
    });
    const [result] = await eslint.lintText('export default () => <a href="/home">Home</a>;', { filePath: 'glob-fixture.jsx' });
    expect(result.messages.map(message => message.ruleId)).toContain('@next/next/no-html-link-for-pages');
  });
});

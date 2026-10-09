import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPaths } from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// These tests deliberately run against the real @actions/tool-cache rather than a mock: a mocked
// `find()` hid the fact that tools cached under non-semver versions could never be found again.
// Only its logging is silenced.
mock.module('@actions/core', { namedExports: { debug: () => {}, isDebug: () => false } });

const { cacheToolDir, cacheToolFile, findCachedTool, toCacheVersion } = await import('../src/tool-cache.ts');
const { VERSIONS } = await import('../src/versions.ts');

describe('tool-cache', () => {
    const env = { RUNNER_TOOL_CACHE: process.env.RUNNER_TOOL_CACHE, RUNNER_TEMP: process.env.RUNNER_TEMP };
    let tmp: string;
    let sourceDir: string;
    let sourceFile: string;
    before(async () => {
        tmp = await mkdtemp(joinPaths(tmpdir(), 'setup-sqlserver-tool-cache-'));
        process.env.RUNNER_TOOL_CACHE = joinPaths(tmp, 'cache');
        process.env.RUNNER_TEMP = joinPaths(tmp, 'temp');
        sourceDir = joinPaths(tmp, 'source');
        sourceFile = joinPaths(tmp, 'download');
        await mkdir(sourceDir);
        await writeFile(joinPaths(sourceDir, 'setup.exe'), 'setup');
        await writeFile(sourceFile, 'download');
    });
    after(async () => {
        for (const [key, value] of Object.entries(env)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        await rm(tmp, { recursive: true, force: true });
    });
    describe('.toCacheVersion()', () => {
        it('pads versions to an explicit semver version', () => {
            assert.equal(toCacheVersion('2022'), '2022.0.0');
            assert.equal(toCacheVersion('17.1'), '17.1.0');
        });
        it('leaves explicit semver versions unchanged', () => {
            assert.equal(toCacheVersion('1.0.0'), '1.0.0');
        });
    });
    describe('.cacheToolDir()', () => {
        for (const version of VERSIONS.keys()) {
            it(`can be found again for SQL Server ${version}`, async () => {
                const toolPath = await cacheToolDir(sourceDir, 'sqlserver', version);
                assert.equal(findCachedTool('sqlserver', version), toolPath);
                assert.equal(await readFile(joinPaths(toolPath, 'setup.exe'), 'utf8'), 'setup');
            });
        }
    });
    describe('.cacheToolFile()', () => {
        for (const version of VERSIONS.keys()) {
            it(`can be found again for SQL Server ${version}`, async () => {
                const toolPath = await cacheToolFile(sourceFile, 'sqlupdate.exe', 'sqlupdate', version);
                assert.equal(findCachedTool('sqlupdate', version), toolPath);
                assert.equal(await readFile(joinPaths(toolPath, 'sqlupdate.exe'), 'utf8'), 'download');
            });
        }
    });
    describe('.findCachedTool()', () => {
        it('returns an empty string for a version that has not been cached', async () => {
            await cacheToolFile(sourceFile, 'tool.exe', 'uncached', '2019');
            assert.equal(findCachedTool('uncached', '2022'), '');
        });
        it('only finds tools cached for the same arch', async () => {
            const toolPath = await cacheToolFile(sourceFile, 'tool.exe', 'arch', '18', 'x86');
            assert.equal(findCachedTool('arch', '18', 'x86'), toolPath);
            assert.equal(findCachedTool('arch', '18', 'x64'), '');
        });
    });
});

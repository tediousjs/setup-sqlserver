import { randomBytes, randomUUID } from 'node:crypto';
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const core = {
    getInput: mock.fn(() => ''),
    getMultilineInput: mock.fn(() => [] as string[]),
    getBooleanInput: mock.fn(() => false),
    info: mock.fn(),
    debug: mock.fn(),
    warning: mock.fn(),
    notice: mock.fn(),
    startGroup: mock.fn(),
    endGroup: mock.fn(),
    isDebug: mock.fn(() => false),
    platform: {
        getDetails: mock.fn(),
    },
};
const exec = { exec: mock.fn(async () => 0) };
const tc = {
    downloadTool: mock.fn(async () => `C:/tmp/${randomUUID()}`),
    cacheFile: mock.fn(async () => `C:/tools/${randomUUID()}`),
    cacheDir: mock.fn(async () => `C:/tools/${randomUUID()}`),
};
const io = { mv: mock.fn(async () => {}) };
const globCreate = mock.fn(async () => ({ glob: async () => [] as string[] }));
const glob = { create: globCreate };

const httpGet = mock.fn(async () => httpResponse);
const httpResponse = {
    message: { statusCode: 200 },
    readBody: mock.fn(async () => ''),
};
class HttpClient {
    get = httpGet;
}
const http = { HttpClient };

const readdir = mock.fn(async () => [] as string[]);
const generateFileHash = mock.fn(async () => randomBytes(32));

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/exec', { namedExports: exec });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('@actions/io', { namedExports: io });
mock.module('@actions/glob', { namedExports: glob });
mock.module('@actions/http-client', { namedExports: http });
mock.module('node:fs/promises', { namedExports: { readdir } });
mock.module('../src/crypto.ts', { namedExports: { generateFileHash } });

const utils = await import('../src/utils.ts');

function resetAll() {
    const fns = [
        core.getInput, core.getMultilineInput, core.getBooleanInput,
        core.info, core.debug, core.warning, core.notice,
        core.startGroup, core.endGroup, core.isDebug, core.platform.getDetails,
        exec.exec,
        tc.downloadTool, tc.cacheFile, tc.cacheDir,
        io.mv, globCreate, httpGet, httpResponse.readBody,
        readdir, generateFileHash,
    ];
    for (const fn of fns) fn.mock.resetCalls();
    core.getInput.mock.mockImplementation(() => '');
    core.getMultilineInput.mock.mockImplementation(() => []);
    core.getBooleanInput.mock.mockImplementation(() => false);
    core.isDebug.mock.mockImplementation(() => false);
    exec.exec.mock.mockImplementation(async () => 0);
    tc.downloadTool.mock.mockImplementation(async () => `C:/tmp/${randomUUID()}`);
    tc.cacheFile.mock.mockImplementation(async () => `C:/tools/${randomUUID()}`);
    tc.cacheDir.mock.mockImplementation(async () => `C:/tools/${randomUUID()}`);
    io.mv.mock.mockImplementation(async () => {});
    globCreate.mock.mockImplementation(async () => ({ glob: async () => [] }));
    httpResponse.message = { statusCode: 200 };
    httpResponse.readBody.mock.mockImplementation(async () => '');
    httpGet.mock.mockImplementation(async () => httpResponse);
    readdir.mock.mockImplementation(async () => []);
    generateFileHash.mock.mockImplementation(async () => randomBytes(32));
}

describe('utils', () => {
    beforeEach(() => {
        resetAll();
    });
    describe('.getOsVersion()', () => {
        beforeEach(() => {
            core.platform.getDetails.mock.mockImplementation(async () => ({
                name: 'Microsoft Windows Server 2019 Datacenter',
                platform: 'win32',
                arch: 'x64',
                version: '10.0.17763',
                isWindows: true,
                isMacOS: false,
                isLinux: false,
            }));
        });
        it('correctly returns for windows-2019', async () => {
            const out = await utils.getOsVersion();
            assert.equal(out, 2019);
        });
        it('correctly returns for windows-2022', async () => {
            core.platform.getDetails.mock.mockImplementation(async () => ({
                name: 'Microsoft Windows Server 2022 Datacenter',
                platform: 'win32',
                arch: 'x64',
                version: '10.0.20348',
                isWindows: true,
                isMacOS: false,
                isLinux: false,
            }));
            const out = await utils.getOsVersion();
            assert.equal(out, 2022);
        });
        it('adds output when debugging', async () => {
            core.isDebug.mock.mockImplementation(() => true);
            await utils.getOsVersion();
            assert.equal(core.isDebug.mock.callCount(), 1);
            assert.equal(core.startGroup.mock.callCount(), 1);
            assert.equal(core.startGroup.mock.calls[0].arguments[0], 'systeminfo');
            assert.equal(core.debug.mock.callCount(), 1);
            assert.equal(core.debug.mock.calls[0].arguments[0], 'name: Microsoft Windows Server 2019 Datacenter\nplatform: win32\narch: x64\nversion: 10.0.17763\nisWindows: true\nisMacOS: false\nisLinux: false');
            assert.equal(core.endGroup.mock.callCount(), 1);
        });
        it('fails gracefully when error is thrown', async () => {
            const err = new Error('synthetic error');
            core.platform.getDetails.mock.mockImplementation(async () => { throw err; });
            const res = await utils.getOsVersion();
            assert.equal(res, null);
            assert.equal(core.warning.mock.callCount(), 1);
            assert.equal(core.warning.mock.calls[0].arguments[0], err);
        });
        it('fails gracefully with bad output', async () => {
            core.platform.getDetails.mock.mockImplementation(async () => ({
                name: 'not a number',
                platform: 'win32',
                arch: 'x64',
                version: '10.0.20348',
                isWindows: true,
                isMacOS: false,
                isLinux: false,
            }));
            const res = await utils.getOsVersion();
            assert.equal(res, null);
        });
    });
    describe('.gatherInputs()', () => {
        function setupInputs(overrides: Record<string, string> = {}) {
            const inputs: Record<string, string> = {
                'sqlserver-version': '',
                'sa-password': 'secret password',
                'db-collation': 'SQL_Latin1_General_CP1_CI_AS',
                'native-client-version': '',
                'odbc-version': '',
                ...overrides,
            };
            core.getInput.mock.mockImplementation((name: string) => inputs[name] ?? '');
            core.getMultilineInput.mock.mockImplementation(() => []);
            core.getBooleanInput.mock.mockImplementation((name: string) => name === 'wait-for-ready');
        }
        it('constructs input object', () => {
            setupInputs({ 'sqlserver-version': 'sql-2022' });
            const res = utils.gatherInputs();
            assert.deepEqual(res, {
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
                nativeClientVersion: '',
                odbcVersion: '',
                installUpdates: false,
            });
        });
        it('constructs input object with no sql- prefix', () => {
            setupInputs({ 'sqlserver-version': '2022' });
            const res = utils.gatherInputs();
            assert.equal(res.version, '2022');
        });
        it('constructs input object with "latest" version', () => {
            setupInputs({ 'sqlserver-version': 'latest' });
            const res = utils.gatherInputs();
            assert.equal(res.version, '2025');
        });
        it('constructs input object with default version', () => {
            setupInputs({ 'sqlserver-version': '' });
            const res = utils.gatherInputs();
            assert.equal(res.version, '2025');
        });
    });
    describe('.downloadTool()', () => {
        it('downloads the tool', async () => {
            const fileName = randomUUID();
            tc.downloadTool.mock.mockImplementation(async () => `C:/path/to/${fileName}`);
            const res = await utils.downloadTool('https://example.com/setup.exe');
            assert.equal(res, `C:/path/to/${fileName}.exe`);
        });
        it('downloads the tool with custom extension', async () => {
            const fileName = randomUUID();
            tc.downloadTool.mock.mockImplementation(async () => `C:/path/to/${fileName}`);
            const res = await utils.downloadTool('https://example.com/setup.exe', '.html');
            assert.equal(res, `C:/path/to/${fileName}.html`);
        });
    });
    describe('.waitForDatabase()', () => {
        it('resolves', async () => {
            const res = await utils.waitForDatabase('password');
            assert.equal(res, 0);
        });
        it('passes a login timeout to sqlcmd', async () => {
            await utils.waitForDatabase('password');
            assert.equal(exec.exec.mock.callCount(), 1);
            const call = exec.exec.mock.calls[0];
            assert.equal(call.arguments[0], 'sqlcmd');
            const args = call.arguments[1] as string[];
            const idx = args.indexOf('-l');
            assert.ok(idx >= 0 && args[idx + 1] === '5');
        });
    });
    describe('.downloadBoxInstaller()', () => {
        it('returns a path to an exe', async () => {
            const res = await utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
        it('throws if no boxUrl', async () => {
            await assert.rejects(() => utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2016',
            }), { message: 'No boxUrl provided' });
        });
        it('calculates digests in debug mode', async () => {
            core.isDebug.mock.mockImplementation(() => true);
            const res = await utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            });
            const calls = core.debug.mock.calls.filter((c) => String(c.arguments[0]).startsWith('Got setup file'));
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
            assert.equal(calls.length, 2);
            assert.match(String(calls[0].arguments[0]), /^Got setup file \(exe\) with hash SHA256=/);
            assert.match(String(calls[1].arguments[0]), /^Got setup file \(box\) with hash SHA256=/);
        });
    });
    describe('.downloadExeInstaller()', () => {
        it('returns a path to an exe', async () => {
            const res = await utils.downloadExeInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
        it('throws if boxUrl', async () => {
            await assert.rejects(() => utils.downloadExeInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2016',
            }), { message: 'Version requires box installer' });
        });
        it('calculates digests in debug mode', async () => {
            core.isDebug.mock.mockImplementation(() => true);
            const res = await utils.downloadExeInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
            });
            const calls = core.debug.mock.calls.filter((c) => String(c.arguments[0]).startsWith('Got setup file'));
            assert.equal(calls.length, 1);
            assert.match(String(calls[0].arguments[0]), /^Got setup file \(exe\) with hash SHA256=/);
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
    });
    describe('.downloadSseiInstaller()', () => {
        beforeEach(() => {
            tc.downloadTool.mock.mockImplementation(async () => `C:/tmp/${randomUUID()}.exe`);
            readdir.mock.mockImplementation(async () => ['ssei-bootstrapper.exe', 'SQLServer2025-x64-ENU.exe']);
        });
        it('returns a path to an exe', async () => {
            const res = await utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe',
                version: '2025',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
        it('throws if no sseiUrl', async () => {
            await assert.rejects(() => utils.downloadSseiInstaller({
                version: '2025',
            }), { message: 'No sseiUrl provided' });
        });
        it('throws if no exe found after download', async () => {
            readdir.mock.mockImplementation(async () => ['readme.txt', 'data.cab']);
            await assert.rejects(() => utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe',
                version: '2025',
            }), { message: 'SSEI bootstrapper did not produce an installer exe' });
        });
        it('calculates digests in debug mode', async () => {
            core.isDebug.mock.mockImplementation(() => true);
            const res = await utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe',
                version: '2025',
            });
            const calls = core.debug.mock.calls.filter((c) => String(c.arguments[0]).startsWith('Got SSEI bootstrapper'));
            assert.equal(calls.length, 1);
            assert.match(String(calls[0].arguments[0]), /^Got SSEI bootstrapper with hash SHA256=/);
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
    });
    describe('.downloadUpdateInstaller()', () => {
        beforeEach(() => {
            httpResponse.message = { statusCode: 200 };
            httpResponse.readBody.mock.mockImplementation(async () => '<a href="https://download.microsoft.com/update.exe">');
        });
        it('returns a path to an exe', async () => {
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/where-are-updates.html',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
        });
        it('throws if no update url', async () => {
            await assert.rejects(() => utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2016',
            }), { message: 'No update url provided' });
        });
        it('calculates digests in debug mode', async () => {
            core.isDebug.mock.mockImplementation(() => true);
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/where-are-updates.html',
            });
            const calls = core.debug.mock.calls.filter((c) => String(c.arguments[0]).startsWith('Got update file'));
            assert.equal(calls.length, 1);
            assert.match(String(calls[0].arguments[0]), /^Got update file with hash SHA256=/);
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
        });
        it('uses an .exe url directly', async () => {
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/sqlupdate.exe',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
            assert.equal(httpGet.mock.callCount(), 0);
        });
        it('returns empty string if URL is not resolved', async () => {
            httpResponse.readBody.mock.mockImplementation(async () => '<a href="https://example.com/update.exe">');
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/sqlupdate.html',
            });
            assert.equal(res, '');
            assert.equal(httpGet.mock.callCount(), 1);
        });
    });
    describe('.gatherSummaryFiles()', () => {
        let globFn: ReturnType<typeof mock.fn>;
        beforeEach(() => {
            globFn = mock.fn(async () => [] as string[]);
            globCreate.mock.mockImplementation(async () => ({ glob: globFn } as any));
        });
        it('returns empty array if no files matched', async () => {
            const res = await utils.gatherSummaryFiles();
            assert.deepEqual(res, []);
        });
        it('returns found files', async () => {
            globFn.mock.mockImplementationOnce(async () => ['C:/tmp/summary.txt']);
            const res = await utils.gatherSummaryFiles();
            assert.deepEqual(res, ['C:/tmp/summary.txt']);
            assert.equal(globCreate.mock.callCount(), 1);
        });
        it('tries to find details files', async () => {
            globFn.mock.mockImplementationOnce(async () => ['C:/tmp/summary.txt']);
            const res = await utils.gatherSummaryFiles(true);
            assert.deepEqual(res, ['C:/tmp/summary.txt']);
            assert.equal(globCreate.mock.callCount(), 2);
        });
        it('finds detail file', async () => {
            globFn.mock.mockImplementationOnce(async () => ['C:/tmp/summary.txt'], 0);
            globFn.mock.mockImplementationOnce(async () => ['C:/tmp/2021/details.txt', 'C:/tmp/2022/details.txt'], 1);
            const res = await utils.gatherSummaryFiles(true);
            assert.deepEqual(res, ['C:/tmp/summary.txt', 'C:/tmp/2022/details.txt']);
            assert.equal(globCreate.mock.callCount(), 2);
        });
    });
});

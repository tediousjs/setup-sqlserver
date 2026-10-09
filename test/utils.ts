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

const fetchResponse = {
    ok: true,
    status: 200,
    text: mock.fn(async () => ''),
};
const fetchMock = mock.fn(async () => fetchResponse);
globalThis.fetch = fetchMock as unknown as typeof fetch;

const mkdtemp = mock.fn(async (prefix: string) => `${prefix}unique`);
// installer extraction expects setup.exe in its sqlserver-setup-* directory; `files` are listed everywhere else
function mediaFiles(files: string[]) {
    return async (path: string) => (path.includes('sqlserver-setup-') ? ['setup.exe'] : files);
}
const readdir = mock.fn(mediaFiles([]));
const generateFileHash = mock.fn(async () => randomBytes(32));
const delay = mock.fn(async (milliseconds: number) => { assert.ok(milliseconds > 0); });

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/exec', { namedExports: exec });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('@actions/io', { namedExports: io });
mock.module('@actions/glob', { namedExports: glob });
mock.module('node:fs/promises', { namedExports: { mkdtemp, readdir } });
mock.module('node:timers/promises', { namedExports: { setTimeout: delay } });
mock.module('../src/crypto.ts', { namedExports: { generateFileHash } });

const utils = await import('../src/utils.ts');

function resetAll() {
    const fns = [
        core.getInput, core.getMultilineInput, core.getBooleanInput,
        core.info, core.debug, core.warning, core.notice,
        core.startGroup, core.endGroup, core.isDebug, core.platform.getDetails,
        exec.exec,
        tc.downloadTool, tc.cacheFile, tc.cacheDir,
        io.mv, globCreate, fetchMock, fetchResponse.text,
        mkdtemp, readdir, generateFileHash, delay,
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
    fetchResponse.ok = true;
    fetchResponse.status = 200;
    fetchResponse.text.mock.mockImplementation(async () => '');
    fetchMock.mock.mockImplementation(async () => fetchResponse);
    mkdtemp.mock.mockImplementation(async (prefix: string) => `${prefix}unique`);
    readdir.mock.mockImplementation(mediaFiles([]));
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
        for (const version of ['2025', 'sql-2025', 'sql-latest']) {
            it(`selects SQL Server 2025 for ${version}`, () => {
                setupInputs({ 'sqlserver-version': version });
                assert.equal(utils.gatherInputs().version, '2025');
            });
        }
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
        it('extracts into an isolated directory before caching', async () => {
            tc.downloadTool.mock.mockImplementation(async () => 'C:/runner temp/installer');
            tc.cacheDir.mock.mockImplementation(async () => 'C:/tools/sqlserver/2022');
            const res = await utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            });
            assert.equal(res, 'C:/tools/sqlserver/2022/setup.exe');
            assert.deepEqual(mkdtemp.mock.calls[0].arguments, ['C:/runner temp/sqlserver-setup-']);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                '"C:/runner temp/installer.exe"',
                ['/qs', '/x:"C:/runner temp/sqlserver-setup-unique"'],
                { cwd: 'C:/runner temp', windowsVerbatimArguments: true },
            ]);
            assert.deepEqual(readdir.mock.calls[0].arguments, ['C:/runner temp/sqlserver-setup-unique']);
            assert.deepEqual(tc.cacheDir.mock.calls[0].arguments, [
                'C:/runner temp/sqlserver-setup-unique', 'sqlserver', '2022',
            ]);
        });
        it('fails without caching if extraction does not produce setup.exe', async () => {
            tc.downloadTool.mock.mockImplementation(async () => 'C:/runner temp/installer');
            readdir.mock.mockImplementation(async () => ['readme.txt']);
            await assert.rejects(() => utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            }), { message: 'Extracting the SQL Server 2022 installer did not produce setup.exe in C:/runner temp/sqlserver-setup-unique (found: readme.txt)' });
            assert.equal(tc.cacheDir.mock.callCount(), 0);
        });
        it('accepts an extracted SETUP.EXE regardless of case', async () => {
            readdir.mock.mockImplementation(async () => ['SETUP.EXE']);
            const res = await utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
            assert.equal(tc.cacheDir.mock.callCount(), 1);
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
            readdir.mock.mockImplementation(mediaFiles(['SQLServer2025-x64-ENU.exe', 'SQLServer2025-x64-ENU.box']));
        });
        it('returns a path to an exe', async () => {
            const res = await utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe',
                version: '2025',
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
        it('downloads into an isolated directory and quotes media paths with spaces', async () => {
            tc.downloadTool.mock.mockImplementation(async () => 'C:/runner temp/bootstrapper');
            tc.cacheDir.mock.mockImplementation(async () => 'C:/tools/sqlserver/2025');
            const res = await utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe',
                version: '2025',
            });
            assert.equal(res, 'C:/tools/sqlserver/2025/setup.exe');
            assert.deepEqual(mkdtemp.mock.calls.map((c) => c.arguments), [
                ['C:/runner temp/sqlserver-media-'],
                ['C:/runner temp/sqlserver-media-unique/sqlserver-setup-'],
            ]);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                '"C:/runner temp/bootstrapper.exe"',
                [
                    '/Action=Download',
                    '/MediaPath="C:/runner temp/sqlserver-media-unique"',
                    '/MediaType=CAB',
                    '/Quiet',
                    '/Language=en-US',
                ],
                { windowsVerbatimArguments: true },
            ]);
            assert.deepEqual(readdir.mock.calls[0].arguments, ['C:/runner temp/sqlserver-media-unique']);
            assert.deepEqual(exec.exec.mock.calls[1].arguments, [
                '"C:/runner temp/sqlserver-media-unique/SQLServer2025-x64-ENU.exe"',
                ['/qs', '/x:"C:/runner temp/sqlserver-media-unique/sqlserver-setup-unique"'],
                { cwd: 'C:/runner temp/sqlserver-media-unique', windowsVerbatimArguments: true },
            ]);
            assert.deepEqual(readdir.mock.calls[1].arguments, ['C:/runner temp/sqlserver-media-unique/sqlserver-setup-unique']);
            assert.deepEqual(tc.cacheDir.mock.calls[0].arguments, [
                'C:/runner temp/sqlserver-media-unique/sqlserver-setup-unique', 'sqlserver', '2025',
            ]);
        });
        it('recognizes uppercase executable extensions', async () => {
            readdir.mock.mockImplementation(mediaFiles(['SQLServer2025-x64-ENU.EXE']));
            await utils.downloadSseiInstaller({ sseiUrl: 'https://example.com/ssei.exe', version: '2025' });
            assert.equal(exec.exec.mock.calls[1].arguments[0], '"C:/tmp/sqlserver-media-unique/SQLServer2025-x64-ENU.EXE"');
        });
        it('rejects ambiguous installer media without extracting or caching it', async () => {
            readdir.mock.mockImplementation(mediaFiles(['first.exe', 'second.exe']));
            await assert.rejects(() => utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe', version: '2025',
            }), { message: 'SSEI bootstrapper produced multiple installer exes: first.exe, second.exe' });
            assert.equal(exec.exec.mock.callCount(), 1);
            assert.equal(tc.cacheDir.mock.callCount(), 0);
        });
        it('propagates bootstrapper errors without extracting or caching media', async () => {
            exec.exec.mock.mockImplementation(async () => { throw new Error('Download failed'); });
            await assert.rejects(() => utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe', version: '2025',
            }), { message: 'Download failed' });
            assert.equal(readdir.mock.callCount(), 0);
            assert.equal(tc.cacheDir.mock.callCount(), 0);
        });
        it('propagates extraction errors without caching incomplete media', async () => {
            exec.exec.mock.mockImplementationOnce(async () => { throw new Error('Extraction failed'); }, 1);
            await assert.rejects(() => utils.downloadSseiInstaller({
                sseiUrl: 'https://example.com/ssei.exe', version: '2025',
            }), { message: 'Extraction failed' });
            assert.equal(exec.exec.mock.callCount(), 2);
            assert.equal(tc.cacheDir.mock.callCount(), 0);
        });
        it('throws if no sseiUrl', async () => {
            await assert.rejects(() => utils.downloadSseiInstaller({
                version: '2025',
            }), { message: 'No sseiUrl provided' });
        });
        for (const [files, found] of [
            [['readme.txt', 'data.cab'], 'readme.txt, data.cab'],
            [[], 'no files'],
        ] as const) {
            it(`throws if no exe found after download (found: ${found})`, async () => {
                readdir.mock.mockImplementation(mediaFiles([...files]));
                await assert.rejects(() => utils.downloadSseiInstaller({
                    sseiUrl: 'https://example.com/ssei.exe',
                    version: '2025',
                }), { message: `SSEI bootstrapper did not produce an installer exe in C:/tmp/sqlserver-media-unique (found: ${found})` });
                assert.equal(tc.cacheDir.mock.callCount(), 0);
            });
        }
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
        const config = {
            version: '2022',
            updateUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=105013',
        };
        const updateUrl = 'https://download.microsoft.com/download/a89001cb-9c99-48d3-9f14-ded054b35fe4/SQLServer2022-KB5104824-x64.exe';
        function metadata(files: unknown, error = '') {
            return `<script>window.__DLCDetails__=${JSON.stringify({
                dlcDetailsView: {
                    error,
                    downloadTitle: 'SQL Server 2022',
                    downloadDescription: 'Cumulative Update Package 27 for SQL Server 2022 - KB5104824',
                    downloadFile: files,
                },
            })};</script>`;
        }
        beforeEach(() => {
            fetchResponse.ok = true;
            fetchResponse.status = 200;
            fetchResponse.text.mock.mockImplementation(async () => '<a href="https://download.microsoft.com/update.exe">');
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
            const directUrl = 'https://download.microsoft.com/download/a/7/7/a77b5753-8fe7-4804-bfc5-591d9a626c98/SQLServer2016SP3-KB5003279-x64-ENU.exe';
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2016',
                updateUrl: directUrl,
            });
            assert.match(res, /^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
            assert.equal(fetchMock.mock.callCount(), 0);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], directUrl);
        });
        it('resolves current Microsoft download metadata without executing JavaScript', async () => {
            const body = metadata([{
                name: 'SQLServer2022-KB5104824-x64.exe', url: updateUrl, version: '16.0.4295.3',
            }]) + '<script>throw new Error("must not execute");</script>';
            assert.equal(/\s+href\s*=\s*["'](https:\/\/download\.microsoft\.com\/.*\.exe)['"]/.test(body), false);
            fetchResponse.text.mock.mockImplementation(async () => body);
            const res = await utils.downloadUpdateInstaller(config);
            assert.match(res, /\/sqlupdate\.exe$/);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        });
        it('supports Microsoft pages containing both metadata and a legacy link', async () => {
            fetchResponse.text.mock.mockImplementation(async () => metadata([{
                name: 'SQLServer2022-KB5104824-x64.exe', url: updateUrl, version: '16.0.4295.3',
            }]) + `<a href="${updateUrl}">download</a>`);
            await utils.downloadUpdateInstaller(config);
            assert.equal(tc.downloadTool.mock.callCount(), 1);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        });
        it('supports escaped JSON URLs and ignores unrelated files and links', async () => {
            fetchResponse.text.mock.mockImplementation(async () => metadata([
                null, {}, { url: 42 }, { url: 'https://download.microsoft.com/readme.txt' },
                { url: updateUrl }, { url: updateUrl },
            ]).replaceAll('https://', 'https:\\/\\/') + '<a href="https://download.microsoft.com/unrelated.exe">link</a>');
            await utils.downloadUpdateInstaller(config);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        });
        it('supports legacy anchors without capturing adjacent attributes or links', async () => {
            fetchResponse.text.mock.mockImplementation(async () =>
                `<A class="download" HREF = '${updateUrl}' data-file="another.exe">download</A> <a href="https://example.com/other.exe">other</a>`);
            await utils.downloadUpdateInstaller(config);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        });
        for (const body of [
            '', '<a href="https://example.com/update.exe">',
            '<a href="http://download.microsoft.com/update.exe">',
            '<a href="https://download.microsoft.com.evil.example/update.exe">',
            '<a href="https://download.microsoft.com@evil.example/update.exe">',
            '<a href="https://download.microsoft.com/update.exe.txt">',
            '<script>const url = "https://download.microsoft.com/update.exe";</script>',
            metadata([{ url: 'https://example.com/update.exe' }]),
        ]) {
            it(`rejects missing or invalid installer URLs: ${body}`, async () => {
                fetchResponse.text.mock.mockImplementation(async () => body);
                await assert.rejects(() => utils.downloadUpdateInstaller(config), /No HTTPS .* installer found/);
                assert.equal(fetchMock.mock.callCount(), 1);
                assert.equal(tc.downloadTool.mock.callCount(), 0);
                assert.equal(tc.cacheFile.mock.callCount(), 0);
                assert.equal(core.warning.mock.callCount(), 0);
                assert.ok(core.debug.mock.calls.some((call) => call.arguments[0] === body));
            });
        }
        for (const body of [
            '<script>window.__DLCDetails__={invalid};</script>',
            '<script>window.__DLCDetails__={"dlcDetailsView":</script>',
            '<script>window.__DLCDetails__=null;</script>',
            '<script>window.__DLCDetails__=[];</script>',
            '<script>window.__DLCDetails__={"dlcDetailsView":null};</script>',
            '<script>window.__DLCDetails__={"renamedDetailsView":{}};</script>',
            '<script>window.__DLCDetails__={"dlcDetailsView":{"renamedDownloadFile":[]}};</script>',
            metadata({ url: updateUrl }),
        ]) {
            it(`falls back to legacy links when metadata is malformed: ${body}`, async () => {
                fetchResponse.text.mock.mockImplementation(async () => body + `<a href="${updateUrl}">download</a>`);
                await utils.downloadUpdateInstaller(config);
                assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
                assert.ok(core.debug.mock.calls.some((call) => String(call.arguments[0]).startsWith('Unable to use cumulative update metadata: ')));
                assert.equal(core.warning.mock.callCount(), 0);
            });
            it(`includes metadata problems when no legacy link exists: ${body}`, async () => {
                fetchResponse.text.mock.mockImplementation(async () => body);
                await assert.rejects(() => utils.downloadUpdateInstaller(config), /No HTTPS .* installer found.* Metadata problems: .+/);
                assert.equal(fetchMock.mock.callCount(), 1);
                assert.equal(tc.downloadTool.mock.callCount(), 0);
                assert.ok(core.debug.mock.calls.some((call) => call.arguments[0] === body));
            });
        }
        it('falls back to legacy links when metadata contains no usable installer', async () => {
            fetchResponse.text.mock.mockImplementation(async () => metadata([{ url: 'https://example.com/untrusted.exe' }]) + `<a href="${updateUrl}">download</a>`);
            await utils.downloadUpdateInstaller(config);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        });
        for (const [files, problem] of [
            [[{ url: 'https://example.com/untrusted.exe' }, { url: 'https://example.com/untrusted.exe' }, { url: '' }, { url: 42 }], 'File list has no HTTPS download.microsoft.com .exe installer (found: https://example.com/untrusted.exe)'],
            [[], 'File list has no HTTPS download.microsoft.com .exe installer'],
        ] as const) {
            it(`names metadata without a usable installer when no legacy link exists: ${problem}`, async () => {
                fetchResponse.text.mock.mockImplementation(async () => metadata(files));
                await assert.rejects(() => utils.downloadUpdateInstaller(config), {
                    message: `No HTTPS download.microsoft.com .exe cumulative update installer found in Microsoft download page. Metadata problems: ${problem}`,
                });
                assert.ok(core.debug.mock.calls.some((call) => call.arguments[0] === `Unable to use cumulative update metadata: ${problem}`));
            });
        }
        it('uses valid metadata after an unusable metadata script', async () => {
            fetchResponse.text.mock.mockImplementation(async () => '<script>window.__DLCDetails__={invalid};</script>' + metadata([{ url: updateUrl }]));
            await utils.downloadUpdateInstaller(config);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        });
        it('includes the Microsoft metadata error when no installer is found', async () => {
            const body = metadata([], 'Download temporarily unavailable');
            fetchResponse.text.mock.mockImplementation(async () => body);
            await assert.rejects(() => utils.downloadUpdateInstaller(config), /No HTTPS .* installer found.* Microsoft download page error: Download temporarily unavailable/);
            assert.ok(core.debug.mock.calls.some((call) => call.arguments[0] === 'Microsoft download page error: Download temporarily unavailable'));
            assert.ok(core.debug.mock.calls.some((call) => call.arguments[0] === body));
        });
        it('can use a legacy link despite a Microsoft metadata error', async () => {
            fetchResponse.text.mock.mockImplementation(async () => metadata([], 'Metadata unavailable') + `<a href="${updateUrl}">download</a>`);
            await utils.downloadUpdateInstaller(config);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
            assert.equal(core.warning.mock.callCount(), 0);
        });
        for (const body of [
            metadata([{ url: updateUrl }, { url: 'https://download.microsoft.com/another.exe' }]),
            `<a href="${updateUrl}">one</a><a href="https://download.microsoft.com/another.exe">two</a>`,
        ]) {
            it(`rejects ambiguous installer files: ${body}`, async () => {
                fetchResponse.text.mock.mockImplementation(async () => body);
                await assert.rejects(() => utils.downloadUpdateInstaller(config), /Multiple cumulative update installers/);
                assert.equal(tc.downloadTool.mock.callCount(), 0);
                assert.ok(core.debug.mock.calls.some((call) => call.arguments[0] === body));
            });
        }
        for (const status of [403, 404]) {
            it(`fails explicitly after retrying HTTP ${status}`, async () => {
                fetchResponse.ok = false;
                fetchResponse.status = status;
                await assert.rejects(() => utils.downloadUpdateInstaller(config), new RegExp(`after 3 attempt\\(s\\): HTTP ${status}`));
                assert.equal(fetchMock.mock.callCount(), 3);
                assert.deepEqual(delay.mock.calls.map((call) => call.arguments[0]), [5000, 10000]);
                assert.equal(tc.downloadTool.mock.callCount(), 0);
                assert.equal(core.warning.mock.callCount(), 0);
            });
        }
        for (const status of [301, 400, 401, 403, 404, 408, 429, 500, 503]) {
            it(`retries transient HTTP ${status}`, async () => {
                fetchMock.mock.mockImplementationOnce(async () => ({ ...fetchResponse, ok: false, status }));
                await utils.downloadUpdateInstaller(config);
                assert.equal(fetchMock.mock.callCount(), 2);
                assert.equal(delay.mock.calls[0].arguments[0], 5000);
                assert.ok(core.info.mock.calls.some((call) => call.arguments[0] === `Cumulative update page fetch failed (HTTP ${status}); retrying (2/3)`));
                assert.equal(core.warning.mock.callCount(), 0);
            });
        }
        for (const error of [new TypeError('fetch failed'), new DOMException('timed out', 'TimeoutError')]) {
            it(`retries transient ${error.name}`, async () => {
                fetchMock.mock.mockImplementationOnce(async () => { throw error; });
                await utils.downloadUpdateInstaller(config);
                assert.equal(fetchMock.mock.callCount(), 2);
                assert.ok(core.info.mock.calls.some((call) => String(call.arguments[0]).includes('retrying (2/3)')));
                assert.equal(core.warning.mock.callCount(), 0);
            });
        }
        it('retries a transient response body failure', async () => {
            fetchResponse.text.mock.mockImplementationOnce(async () => { throw new TypeError('terminated'); });
            await utils.downloadUpdateInstaller(config);
            assert.equal(fetchMock.mock.callCount(), 2);
        });
        it('does not retry non-network errors', async () => {
            fetchMock.mock.mockImplementation(async () => { throw new Error('unexpected error'); });
            await assert.rejects(() => utils.downloadUpdateInstaller(config), /after 1 attempt\(s\): unexpected error/);
            assert.equal(fetchMock.mock.callCount(), 1);
        });
        it('fails after three unsuccessful HTTP attempts', async () => {
            fetchResponse.ok = false;
            fetchResponse.status = 503;
            await assert.rejects(() => utils.downloadUpdateInstaller(config), /after 3 attempt\(s\): HTTP 503/);
            assert.equal(fetchMock.mock.callCount(), 3);
            assert.deepEqual(delay.mock.calls.map((call) => call.arguments[0]), [5000, 10000]);
            assert.equal(core.info.mock.callCount(), 2);
            assert.equal(core.warning.mock.callCount(), 0);
            assert.equal(tc.downloadTool.mock.callCount(), 0);
        });
        it('fails after three unsuccessful network attempts', async () => {
            fetchMock.mock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
            await assert.rejects(() => utils.downloadUpdateInstaller(config), /after 3 attempt\(s\): fetch failed/);
            assert.equal(fetchMock.mock.callCount(), 3);
            assert.equal(tc.cacheFile.mock.callCount(), 0);
        });
        for (const [cause, detail] of [
            [new Error('connection reset'), 'connection reset'],
            [{ code: 'ENOTFOUND' }, 'ENOTFOUND'],
            [{ message: 'other side closed', code: 'UND_ERR_SOCKET' }, 'other side closed / UND_ERR_SOCKET'],
            [{ message: 'getaddrinfo ENOTFOUND download.example', code: 'ENOTFOUND' }, 'getaddrinfo ENOTFOUND download.example'],
            ['ECONNRESET', 'ECONNRESET'],
        ] as const) {
            it(`preserves the network failure cause: ${detail}`, async () => {
                const error = new TypeError('fetch failed', { cause });
                fetchMock.mock.mockImplementation(async () => { throw error; });
                await assert.rejects(() => utils.downloadUpdateInstaller(config), {
                    message: `Unable to fetch cumulative update page ${config.updateUrl} after 3 attempt(s): fetch failed (${detail})`,
                    cause: error,
                });
                assert.equal(fetchMock.mock.callCount(), 3);
                assert.equal(core.info.mock.calls[0].arguments[0], `Cumulative update page fetch failed (fetch failed (${detail})); retrying (2/3)`);
                assert.equal(core.warning.mock.callCount(), 0);
            });
        }
        it('propagates installer download failures without caching', async () => {
            tc.downloadTool.mock.mockImplementation(async () => { throw new Error('download failed'); });
            await assert.rejects(() => utils.downloadUpdateInstaller(config), /download failed/);
            assert.equal(tc.cacheFile.mock.callCount(), 0);
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

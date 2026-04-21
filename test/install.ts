import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { VersionConfig } from '../src/versions.ts';

const core = {
    info: mock.fn(),
    debug: mock.fn(),
    notice: mock.fn(),
    warning: mock.fn(),
    setOutput: mock.fn(),
    startGroup: mock.fn(),
    endGroup: mock.fn(),
    group: mock.fn(async (_msg: string, cb: () => unknown) => cb()),
    isDebug: mock.fn(() => false),
    platform: { platform: 'win32' as string },
};
const exec = { exec: mock.fn(async () => 0) };
const tc = { find: mock.fn(() => '') };
const readFile = mock.fn(async () => Buffer.from(''));

const installNativeClient = mock.fn(async () => {});
const installOdbc = mock.fn(async () => {});

const VERSIONS = new Map<string, VersionConfig>();

const utils = {
    gatherInputs: mock.fn(),
    getOsVersion: mock.fn(async () => 2022 as number | null),
    gatherSummaryFiles: mock.fn(async () => [] as string[]),
    downloadExeInstaller: mock.fn(async () => 'C:/tmp/exe/setup.exe'),
    downloadBoxInstaller: mock.fn(async () => 'C:/tmp/box/setup.exe'),
    downloadSseiInstaller: mock.fn(async () => 'C:/tmp/ssei/setup.exe'),
    downloadUpdateInstaller: mock.fn(async () => 'C:/tmp/exe/sqlupdate.exe'),
    waitForDatabase: mock.fn(async () => 0),
    downloadTool: mock.fn(async () => ''),
};

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/exec', { namedExports: exec });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('node:fs/promises', { namedExports: { readFile } });
mock.module('../src/versions.ts', { namedExports: { VERSIONS } });
mock.module('../src/utils.ts', { namedExports: utils });
mock.module('../src/install-native-client.ts', { defaultExport: installNativeClient });
mock.module('../src/install-odbc.ts', { defaultExport: installOdbc });

const { default: install } = await import('../src/install.ts');

type Inputs = ReturnType<typeof utils.gatherInputs>;

const defaultInputs = (overrides: Partial<Inputs> = {}): Inputs => ({
    version: 'box',
    password: 'secret password',
    collation: 'SQL_Latin1_General_CP1_CI_AS',
    installArgs: [],
    wait: true,
    skipOsCheck: false,
    nativeClientVersion: '',
    odbcVersion: '',
    installUpdates: false,
    ...overrides,
} as Inputs);

function resetAllMocks() {
    const fns = [
        core.info, core.debug, core.notice, core.warning, core.setOutput,
        core.startGroup, core.endGroup, core.group, core.isDebug,
        exec.exec, tc.find, readFile,
        installNativeClient, installOdbc,
        utils.gatherInputs, utils.getOsVersion, utils.gatherSummaryFiles,
        utils.downloadExeInstaller, utils.downloadBoxInstaller,
        utils.downloadSseiInstaller, utils.downloadUpdateInstaller,
        utils.waitForDatabase, utils.downloadTool,
    ];
    for (const fn of fns) {
        fn.mock.resetCalls();
    }
}

describe('install', () => {
    beforeEach(() => {
        resetAllMocks();
        core.isDebug.mock.mockImplementation(() => false);
        core.group.mock.mockImplementation(async (_msg: string, cb: () => unknown) => cb());
        core.platform.platform = 'win32';
        exec.exec.mock.mockImplementation(async () => 0);
        tc.find.mock.mockImplementation(() => '');
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs());
        utils.getOsVersion.mock.mockImplementation(async () => 2022);
        utils.gatherSummaryFiles.mock.mockImplementation(async () => []);
        utils.downloadExeInstaller.mock.mockImplementation(async () => 'C:/tmp/exe/setup.exe');
        utils.downloadBoxInstaller.mock.mockImplementation(async () => 'C:/tmp/box/setup.exe');
        utils.downloadSseiInstaller.mock.mockImplementation(async () => 'C:/tmp/ssei/setup.exe');
        utils.downloadUpdateInstaller.mock.mockImplementation(async () => 'C:/tmp/exe/sqlupdate.exe');
        utils.waitForDatabase.mock.mockImplementation(async () => 0);

        VERSIONS.clear();
        VERSIONS.set('box', {
            version: '2022',
            exeUrl: 'https://example.com/installer.exe',
            boxUrl: 'https://example.com/installer.box',
            updateUrl: 'https://example.com/update.html',
        });
        VERSIONS.set('exe', {
            version: '2019',
            exeUrl: 'https://example.com/setup.exe',
            updateUrl: 'https://example.com/update.exe',
        });
        VERSIONS.set('ssei', {
            version: '2025',
            sseiUrl: 'https://example.com/ssei.exe',
            updateUrl: 'https://example.com/update.html',
        });
        VERSIONS.set('maxOs', {
            version: '2017',
            exeUrl: 'https://example.com/setup.exe',
            osSupport: { max: 2019 },
        });
        VERSIONS.set('minOs', {
            version: '2017',
            exeUrl: 'https://example.com/setup.exe',
            osSupport: { min: 2022 },
        });
        VERSIONS.set('minMaxOs', {
            version: '2017',
            exeUrl: 'https://example.com/setup.exe',
            osSupport: { min: 2019, max: 2022 },
        });
    });
    afterEach(() => {
    });

    it('fails if bad os', async () => {
        core.platform.platform = 'linux';
        await assert.rejects(() => install(), {
            message: 'setup-sqlserver only supports Windows runners, got: linux',
        });
    });
    it('fails if bad sql version', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'missing' }));
        await assert.rejects(() => install(), {
            message: 'Unsupported SQL Version, supported versions are box, exe, ssei, maxOs, minOs, minMaxOs, got: missing',
        });
    });
    it('runs a box install', async () => {
        await install();
        const call = exec.exec.mock.calls[0];
        assert.equal(call.arguments[0], '"C:/tmp/box/setup.exe"');
        assert.deepEqual(call.arguments[2], { windowsVerbatimArguments: true });
    });
    it('runs an exe install', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'exe' }));
        await install();
        assert.equal(exec.exec.mock.calls[0].arguments[0], '"C:/tmp/exe/setup.exe"');
    });
    it('runs an ssei install', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'ssei' }));
        await install();
        assert.equal(exec.exec.mock.calls[0].arguments[0], '"C:/tmp/ssei/setup.exe"');
    });
    it('downloads cumulative updates', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'exe', installUpdates: true }));
        await install();
        const args = exec.exec.mock.calls[0].arguments[1] as string[];
        assert.ok(args.includes('/UPDATEENABLED=1'));
        assert.ok(args.includes('/UpdateSource=C:/tmp/exe'));
    });
    it('uses cached updates if found', async () => {
        tc.find.mock.mockImplementation((tool: string) => tool === 'sqlupdate' ? 'C:/tool-cache/sql-update' : '');
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'exe', installUpdates: true }));
        await install();
        const args = exec.exec.mock.calls[0].arguments[1] as string[];
        assert.ok(args.includes('/UPDATEENABLED=1'));
        assert.ok(args.includes('/UpdateSource=C:/tool-cache/sql-update'));
    });
    it('skips cumulative updates if no update url', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'minOs', installUpdates: true }));
        await install();
        const args = exec.exec.mock.calls[0].arguments[1] as string[];
        assert.ok(!args.includes('/UPDATEENABLED=1'));
    });
    it('uses cached tool if found', async () => {
        tc.find.mock.mockImplementation((tool: string) => tool === 'sqlserver' ? 'C:/tool-cache/sql-server' : '');
        await install();
        assert.equal(exec.exec.mock.calls[0].arguments[0], '"C:/tool-cache/sql-server/setup.exe"');
    });
    it('errors on os max support', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'maxOs' }));
        await assert.rejects(() => install(), {
            message: 'Runner version windows-2022 is not supported for SQL Server maxOs. Please use windows-2019.',
        });
    });
    it('errors on os min support', async () => {
        utils.getOsVersion.mock.mockImplementation(async () => 2019);
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'minOs' }));
        await assert.rejects(() => install(), {
            message: 'Runner version windows-2019 is not supported for SQL Server minOs. Please use windows-2022.',
        });
    });
    it('errors on os min & max support', async () => {
        utils.getOsVersion.mock.mockImplementation(async () => 2016);
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'minMaxOs' }));
        await assert.rejects(() => install(), {
            message: 'Runner version windows-2016 is not supported for SQL Server minMaxOs. Please use windows-2019 to windows-2022.',
        });
    });
    it('continues if no os version found', async () => {
        utils.getOsVersion.mock.mockImplementation(async () => null);
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'maxOs' }));
        await install();
        assert.equal(exec.exec.mock.calls[0].arguments[0], '"C:/tmp/exe/setup.exe"');
    });
    it('continues if os version is good', async () => {
        utils.getOsVersion.mock.mockImplementation(async () => 2019);
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'maxOs' }));
        await install();
        assert.equal(exec.exec.mock.calls[0].arguments[0], '"C:/tmp/exe/setup.exe"');
    });
    it('skips os checks when needed', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ version: 'maxOs', skipOsCheck: true }));
        await install();
        assert.equal(exec.exec.mock.calls[0].arguments[0], '"C:/tmp/exe/setup.exe"');
    });
    it('waits for max of 10 attempts', async () => {
        const original = globalThis.setTimeout;
        (globalThis as any).setTimeout = (cb: () => void) => { cb(); return 0 as any; };
        try {
            utils.waitForDatabase.mock.mockImplementation(async () => 1);
            await install();
        } finally {
            globalThis.setTimeout = original;
        }
        assert.equal(utils.waitForDatabase.mock.callCount(), 6);
    });
    it('waits until db is ready', async () => {
        const original = globalThis.setTimeout;
        (globalThis as any).setTimeout = (cb: () => void) => { cb(); return 0 as any; };
        try {
            let call = 0;
            utils.waitForDatabase.mock.mockImplementation(async () => {
                call++;
                return call >= 3 ? 0 : 1;
            });
            await install();
        } finally {
            globalThis.setTimeout = original;
        }
        assert.equal(utils.waitForDatabase.mock.callCount(), 3);
    });
    it('fetches summary files', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ wait: false }));
        readFile.mock.mockImplementation(async () => Buffer.from('test data'));
        utils.gatherSummaryFiles.mock.mockImplementation(async () => ['C:/tmp/summary.txt']);
        await install();
        assert.equal(core.startGroup.mock.callCount(), 1);
        assert.equal(core.startGroup.mock.calls[0].arguments[0], 'summary.txt');
        assert.ok(core.info.mock.calls.some((c) => c.arguments[0] === 'test data'));
        assert.equal(core.endGroup.mock.callCount(), 1);
    });
    it('fetches summary files with details on errors', async () => {
        readFile.mock.mockImplementation(async () => Buffer.from('test data'));
        utils.gatherSummaryFiles.mock.mockImplementation(async () => ['C:/tmp/summary.txt']);
        exec.exec.mock.mockImplementation(async () => { throw new Error('synthetic error'); });
        await assert.rejects(() => install(), { message: 'synthetic error' });
        assert.equal(utils.gatherSummaryFiles.mock.callCount(), 1);
        assert.equal(utils.gatherSummaryFiles.mock.calls[0].arguments[0], true);
        assert.equal(core.startGroup.mock.callCount(), 1);
        assert.equal(core.startGroup.mock.calls[0].arguments[0], 'summary.txt');
        assert.ok(core.info.mock.calls.some((c) => c.arguments[0] === 'test data'));
        assert.equal(core.endGroup.mock.callCount(), 1);
    });
    it('fetches summary detail files during debug', async () => {
        readFile.mock.mockImplementation(async () => Buffer.from('test data'));
        utils.gatherSummaryFiles.mock.mockImplementation(async () => ['C:/tmp/summary.txt']);
        core.isDebug.mock.mockImplementation(() => true);
        await install();
        assert.equal(utils.gatherSummaryFiles.mock.callCount(), 1);
        assert.equal(utils.gatherSummaryFiles.mock.calls[0].arguments[0], true);
        assert.ok(core.info.mock.calls.some((c) => c.arguments[0] === 'test data'));
    });
    it('installs native client if needed', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ wait: false, nativeClientVersion: '11' }));
        await install();
        assert.equal(installNativeClient.mock.callCount(), 1);
        assert.equal(installNativeClient.mock.calls[0].arguments[0], '11');
    });
    it('installs odbc driver if needed', async () => {
        utils.gatherInputs.mock.mockImplementation(() => defaultInputs({ wait: false, nativeClientVersion: '11', odbcVersion: '18' }));
        await install();
        assert.equal(installNativeClient.mock.callCount(), 1);
        assert.equal(installNativeClient.mock.calls[0].arguments[0], '11');
        assert.equal(installOdbc.mock.callCount(), 1);
        assert.equal(installOdbc.mock.calls[0].arguments[0], '18');
    });
});

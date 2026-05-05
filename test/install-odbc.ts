import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const core = {
    info: mock.fn(),
    debug: mock.fn(),
};
const tc = {
    find: mock.fn(),
    downloadTool: mock.fn(),
    cacheFile: mock.fn(),
};
const exec = { exec: mock.fn() };
const io = { mv: mock.fn() };

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('@actions/exec', { namedExports: exec });
mock.module('@actions/io', { namedExports: io });

const { default: installOdbc } = await import('../src/install-odbc.ts');

describe('install-odbc', () => {
    let arch: PropertyDescriptor;
    beforeEach(() => {
        arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        for (const fn of [core.info, core.debug, tc.find, tc.downloadTool, tc.cacheFile, exec.exec, io.mv]) {
            fn.mock.resetCalls();
        }
        tc.find.mock.mockImplementation(() => '');
        tc.downloadTool.mock.mockImplementation(async () => 'C:/tmp/downloads');
        tc.cacheFile.mock.mockImplementation(async () => 'C:/tmp/cache/');
        exec.exec.mock.mockImplementation(async () => 0);
        io.mv.mock.mockImplementation(async () => {});
    });
    afterEach(() => {
        Object.defineProperty(process, 'arch', arch);
    });
    describe('.installOdbc()', () => {
        it('throws for bad version', async () => {
            await assert.rejects(() => installOdbc('10'), {
                message: 'Invalid ODBC version supplied 10. Must be one of 18, 17.',
            });
        });
        it('installs from cache', async () => {
            tc.find.mock.mockImplementation(() => 'C:/tmp/');
            await installOdbc('18');
            assert.equal(tc.downloadTool.mock.callCount(), 0);
            assert.equal(exec.exec.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                [
                    '/passive',
                    '/i',
                    'C:/tmp/msodbcsql.msi',
                    'IACCEPTMSODBCSQLLICENSETERMS=YES',
                ],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs from web (x64)', async () => {
            Object.defineProperty(process, 'arch', { value: 'x64' });
            await installOdbc('17');
            assert.equal(tc.downloadTool.mock.callCount(), 1);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], 'https://go.microsoft.com/fwlink/?linkid=2239168');
            assert.equal(tc.cacheFile.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                [
                    '/passive',
                    '/i',
                    'C:/tmp/cache/msodbcsql.msi',
                    'IACCEPTMSODBCSQLLICENSETERMS=YES',
                ],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs from web (x32)', async () => {
            Object.defineProperty(process, 'arch', { value: 'x32' });
            await installOdbc('17');
            assert.equal(tc.downloadTool.mock.callCount(), 1);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], 'https://go.microsoft.com/fwlink/?linkid=2238791');
            assert.equal(tc.cacheFile.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                [
                    '/passive',
                    '/i',
                    'C:/tmp/cache/msodbcsql.msi',
                    'IACCEPTMSODBCSQLLICENSETERMS=YES',
                ],
                { windowsVerbatimArguments: true },
            ]);
        });
    });
});

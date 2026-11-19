import { win32 } from 'node:path';
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
mock.module('node:path', { namedExports: { ...win32 }, defaultExport: win32 });

const { default: installNativeClient } = await import('../src/install-native-client.ts');

describe('install-native-client', () => {
    let arch: PropertyDescriptor;
    beforeEach(() => {
        arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        for (const fn of [core.info, core.debug, tc.find, tc.downloadTool, tc.cacheFile, exec.exec, io.mv]) {
            fn.mock.resetCalls();
        }
        tc.find.mock.mockImplementation(() => '');
        tc.downloadTool.mock.mockImplementation(async () => 'C:\\tmp\\downloads');
        tc.cacheFile.mock.mockImplementation(async () => 'C:\\tmp\\cache\\');
        exec.exec.mock.mockImplementation(async () => 0);
        io.mv.mock.mockImplementation(async () => {});
    });
    afterEach(() => {
        Object.defineProperty(process, 'arch', arch);
    });
    describe('.installNativeClient()', () => {
        it('throws for bad version', async () => {
            await assert.rejects(() => installNativeClient('10'), {
                message: 'Invalid native client version supplied 10. Must be one of 11.',
            });
        });
        it('installs from cache', async () => {
            Object.defineProperty(process, 'arch', { value: 'x64' });
            tc.find.mock.mockImplementation(() => 'C:\\tmp\\');
            await installNativeClient('11');
            assert.deepEqual(tc.find.mock.calls[0].arguments, ['sqlncli', '11.0.0', 'x64']);
            assert.equal(tc.downloadTool.mock.callCount(), 0);
            assert.equal(exec.exec.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                [
                    '/passive',
                    '/i',
                    '"C:\\tmp\\sqlncli.msi"',
                    'APPGUID={0CC618CE-F36A-415E-84B4-FB1BFF6967E1}',
                    'IACCEPTSQLNCLILICENSETERMS=YES',
                ],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs from web (x64)', async () => {
            Object.defineProperty(process, 'arch', { value: 'x64' });
            await installNativeClient('11');
            assert.equal(tc.downloadTool.mock.callCount(), 1);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], 'https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x64/sqlncli.msi');
            assert.equal(tc.cacheFile.mock.callCount(), 1);
            assert.equal(exec.exec.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                [
                    '/passive',
                    '/i',
                    '"C:\\tmp\\cache\\sqlncli.msi"',
                    'APPGUID={0CC618CE-F36A-415E-84B4-FB1BFF6967E1}',
                    'IACCEPTSQLNCLILICENSETERMS=YES',
                ],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs from web (x32)', async () => {
            Object.defineProperty(process, 'arch', { value: 'x32' });
            await installNativeClient('11');
            assert.equal(tc.downloadTool.mock.callCount(), 1);
            assert.equal(tc.downloadTool.mock.calls[0].arguments[0], 'https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x86/sqlncli.msi');
            assert.equal(tc.cacheFile.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                [
                    '/passive',
                    '/i',
                    '"C:\\tmp\\cache\\sqlncli.msi"',
                    'APPGUID={0CC618CE-F36A-415E-84B4-FB1BFF6967E1}',
                    'IACCEPTSQLNCLILICENSETERMS=YES',
                ],
                { windowsVerbatimArguments: true },
            ]);
        });
    });
});

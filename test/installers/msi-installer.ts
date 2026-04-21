import { randomUUID } from 'node:crypto';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const core = {
    info: mock.fn(),
    debug: mock.fn(),
};
const tc = {
    find: mock.fn(() => ''),
    downloadTool: mock.fn(async () => 'C:/tmp/installer'),
    cacheFile: mock.fn(async () => 'C:/cache/installer'),
};
const io = { mv: mock.fn(async () => {}) };
const exec = { exec: mock.fn(async () => 0) };

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('@actions/io', { namedExports: io });
mock.module('@actions/exec', { namedExports: exec });

const { MsiInstaller } = await import('../../src/installers/index.ts');

describe('MsiInstaller', () => {
    beforeEach(() => {
        for (const fn of [core.info, core.debug, tc.find, tc.downloadTool, tc.cacheFile, io.mv, exec.exec]) {
            fn.mock.resetCalls();
        }
        tc.find.mock.mockImplementation(() => '');
        tc.cacheFile.mock.mockImplementation(async () => 'C:/cache/installer');
        tc.downloadTool.mock.mockImplementation(async () => 'C:/tmp/installer');
        io.mv.mock.mockImplementation(async () => {});
        exec.exec.mock.mockImplementation(async () => 0);
    });
    describe('.constructor()', () => {
        it('populates options', () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi', x64: 'https://example.com/x64.msi' },
            });
            assert.equal(installer.name, 'test');
            assert.equal(installer.version, '1.0.0');
            assert.deepEqual((installer as any).urls, { x86: 'https://example.com/x86.msi', x64: 'https://example.com/x64.msi' });
            assert.equal((installer as any).silent, true);
            assert.equal((installer as any).guid, undefined);
            assert.deepEqual((installer as any).extraArgs, []);
        });
        it('allows silent to be false', () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi', x64: 'https://example.com/x64.msi' },
                silent: false,
            });
            assert.equal((installer as any).silent, false);
        });
        it('accepts extra args', () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi', x64: 'https://example.com/x64.msi' },
                extraArgs: ['/q'],
            });
            assert.deepEqual((installer as any).extraArgs, ['/q']);
        });
    });
    describe('.installUrl', () => {
        let arch: PropertyDescriptor;
        beforeEach(() => {
            arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        });
        afterEach(() => {
            Object.defineProperty(process, 'arch', arch);
        });
        describe('x86', () => {
            beforeEach(() => {
                Object.defineProperty(process, 'arch', { value: 'x32' });
            });
            it('fetches the install URL for x86 arch', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: { x86: 'https://example.com/x86.msi', x64: 'https://example.com/x64.msi' },
                });
                assert.equal((installer as any).installUrl, 'https://example.com/x86.msi');
            });
            it('fetches the install URL if there is only one on x86', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: { x64: 'https://example.com/x64.msi' },
                });
                assert.equal((installer as any).installUrl, 'https://example.com/x64.msi');
            });
        });
        describe('x64', () => {
            beforeEach(() => {
                Object.defineProperty(process, 'arch', { value: 'x64' });
            });
            it('fetches the install URL for x64 arch', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: { x86: 'https://example.com/x86.msi', x64: 'https://example.com/x64.msi' },
                });
                assert.equal((installer as any).installUrl, 'https://example.com/x64.msi');
            });
            it('fetches the install URL if there is only one on x64', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: { x86: 'https://example.com/x86.msi' },
                });
                assert.equal((installer as any).installUrl, 'https://example.com/x86.msi');
            });
        });
    });
    describe('.install()', () => {
        it('returns a cached path if found', async () => {
            tc.find.mock.mockImplementation(() => 'C:/cache/test/x86');
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi' },
            });
            await installer.install();
            assert.equal(tc.downloadTool.mock.callCount(), 0);
            assert.equal(tc.cacheFile.mock.callCount(), 0);
            assert.equal(exec.exec.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                ['/passive', '/i', 'C:/cache/test/x86/test.msi'],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('downloads the tool if no cached path if found', async () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi' },
            });
            await installer.install();
            assert.equal(tc.downloadTool.mock.callCount(), 1);
            assert.equal(tc.cacheFile.mock.callCount(), 1);
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                ['/passive', '/i', 'C:/cache/installer/test.msi'],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs with APPGUID option if supplied', async () => {
            const appGuid = randomUUID();
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi' },
                appGuid,
            });
            await installer.install();
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                ['/passive', '/i', 'C:/cache/installer/test.msi', `APPGUID={${appGuid}}`],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs without /passive flag if not silent', async () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi' },
                silent: false,
            });
            await installer.install();
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                ['/i', 'C:/cache/installer/test.msi'],
                { windowsVerbatimArguments: true },
            ]);
        });
        it('installs with extra supplied args', async () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: { x86: 'https://example.com/x86.msi' },
                extraArgs: ['REINSTALL="ALL"'],
            });
            await installer.install();
            assert.deepEqual(exec.exec.mock.calls[0].arguments, [
                'msiexec',
                ['/passive', '/i', 'C:/cache/installer/test.msi', 'REINSTALL="ALL"'],
                { windowsVerbatimArguments: true },
            ]);
        });
    });
});

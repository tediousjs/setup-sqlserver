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
    cacheDir: mock.fn(async () => 'C:/cache/installer'),
};
const io = { mv: mock.fn(async () => {}) };

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('@actions/io', { namedExports: io });

const { Installer } = await import('../../src/installers/installer.ts');

class TestInstaller extends Installer {
    install(): Promise<void> {
        return Promise.resolve();
    }
    public getArch() {
        return super.getArch();
    }
    public downloadInstaller(url: string, extName?: string) {
        return super.downloadInstaller(url, extName);
    }
}

describe('Installer', () => {
    beforeEach(() => {
        for (const fn of [core.info, core.debug, tc.find, tc.downloadTool, tc.cacheFile, tc.cacheDir, io.mv]) {
            fn.mock.resetCalls();
        }
        tc.find.mock.mockImplementation(() => '');
        io.mv.mock.mockImplementation(async () => {});
    });
    describe('.constructor()', () => {
        it('populates name/version', () => {
            const installer = new TestInstaller({ name: 'test', version: '1.0.0' });
            assert.equal(installer.name, 'test');
            assert.equal(installer.version, '1.0.0');
        });
    });
    describe('.getArch()', () => {
        let arch: PropertyDescriptor;
        beforeEach(() => {
            arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        });
        afterEach(() => {
            Object.defineProperty(process, 'arch', arch);
        });
        it('returns x386 for 32 bit', () => {
            Object.defineProperty(process, 'arch', { value: 'x32' });
            assert.equal(new TestInstaller({ name: 'test', version: '1.0.0' }).getArch(), 'x86');
        });
        it('returns x64 for 64 bit', () => {
            Object.defineProperty(process, 'arch', { value: 'x64' });
            assert.equal(new TestInstaller({ name: 'test', version: '1.0.0' }).getArch(), 'x64');
        });
    });
    describe('.downloadInstaller()', () => {
        it('downloads the tool', async () => {
            const fileName = randomUUID();
            tc.downloadTool.mock.mockImplementation(async () => `C:/path/to/${fileName}`);
            const res = await new TestInstaller({ name: 'test', version: '1.0.0' }).downloadInstaller('https://example.com/setup.exe');
            assert.equal(res, `C:/path/to/${fileName}.exe`);
        });
        it('downloads the tool with custom extension', async () => {
            const fileName = randomUUID();
            tc.downloadTool.mock.mockImplementation(async () => `C:/path/to/${fileName}`);
            const res = await new TestInstaller({ name: 'test', version: '1.0.0' }).downloadInstaller('https://example.com/setup.exe', '.html');
            assert.equal(res, `C:/path/to/${fileName}.html`);
        });
    });
});

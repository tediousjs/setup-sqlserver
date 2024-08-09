import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { stub, restore, SinonStubbedInstance } from 'sinon';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as io from '@actions/io';
import { Installer } from '../../src/installers/installer';

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
    let stubTc: SinonStubbedInstance<typeof tc>;
    let stubIo: SinonStubbedInstance<typeof io>;
    beforeEach('stub libs', () => {
        stub(core);
        stubTc = stub(tc);
        stubIo = stub(io);
    });
    afterEach('restore stubs', () => {
        restore();
    });
    describe('.constructor()', () => {
        it('populates name/version', () => {
            const installer = new TestInstaller({
                name: 'test',
                version: '1.0.0',
            });
            expect(installer.name).to.equal('test');
            expect(installer.version).to.equal('1.0.0');
        });
    });
    describe('.getArch()', () => {
        let arch: PropertyDescriptor;
        beforeEach('store arch', () => {
            arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        });
        afterEach('reset arch', () => {
            Object.defineProperty(process, 'arch', arch);
        });
        it('returns x386 for 32 bit', () => {
            Object.defineProperty(process, 'arch', {
                value: 'x32',
            });
            expect(new TestInstaller({ name: 'test', version: '1.0.0' }).getArch()).to.equal('x86');
        });
        it('returns x64 for 64 bit', () => {
            Object.defineProperty(process, 'arch', {
                value: 'x64',
            });
            expect(new TestInstaller({ name: 'test', version: '1.0.0' }).getArch()).to.equal('x64');
        });
    });
    describe('.downloadInstaller()', () => {
        beforeEach('stub deps', () => {
            stubIo.mv.resolves();
        });
        it('downloads the tool', async () => {
            const fileName = randomUUID();
            stubTc.downloadTool.withArgs('https://example.com/setup.exe').resolves(`C:/path/to/${fileName}`);
            const res = await new TestInstaller({ name: 'test', version: '1.0.0' }).downloadInstaller('https://example.com/setup.exe');
            expect(res).to.equal(`C:/path/to/${fileName}.exe`);
        });
        it('downloads the tool with custom extension', async () => {
            const fileName = randomUUID();
            stubTc.downloadTool.withArgs('https://example.com/setup.exe').resolves(`C:/path/to/${fileName}`);
            const res = await new TestInstaller({ name: 'test', version: '1.0.0' }).downloadInstaller('https://example.com/setup.exe', '.html');
            expect(res).to.equal(`C:/path/to/${fileName}.html`);
        });
    });
});

import { randomUUID } from 'node:crypto';
import { expect, use } from 'chai';
import sinonChai from 'sinon-chai';
import { stub, restore, SinonStubbedInstance } from 'sinon';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as io from '@actions/io';
import * as exec from '@actions/exec';
import { MsiInstaller } from '../../src/installers';
use(sinonChai);

describe('Installer', () => {
    let stubTc: SinonStubbedInstance<typeof tc>;
    let stubIo: SinonStubbedInstance<typeof io>;
    let stubExec: SinonStubbedInstance<typeof exec>;
    beforeEach('stub libs', () => {
        stub(core);
        stubTc = stub(tc);
        stubTc.find.returns('');
        stubTc.cacheFile.resolves('C:/cache/installer');
        stubTc.downloadTool.resolves('C:/tmp/installer');
        stubIo = stub(io);
        stubIo.mv.resolves();
        stubExec = stub(exec);
        stubExec.exec.resolves(0);
    });
    afterEach('restore stubs', () => {
        restore();
    });
    describe('.constructor()', () => {
        it('populates options', () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                    x64: 'https://example.com/x64.msi',
                },
            });
            expect(installer.name).to.equal('test');
            expect(installer.version).to.equal('1.0.0');
            expect((installer as any).urls).to.deep.equal({
                x86: 'https://example.com/x86.msi',
                x64: 'https://example.com/x64.msi',
            });
            expect((installer as any).silent).to.equal(true);
            expect((installer as any).guid).to.equal(undefined);
            expect((installer as any).extraArgs).to.deep.equal([]);
        });
        it('allows silent to be false', () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                    x64: 'https://example.com/x64.msi',
                },
                silent: false,
            });
            expect((installer as any).silent).to.equal(false);
        });
        it('accepts extra args', () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                    x64: 'https://example.com/x64.msi',
                },
                extraArgs: ['/q'],
            });
            expect((installer as any).extraArgs).to.deep.equal(['/q']);
        });
    });
    describe('.installUrl', () => {
        let arch: PropertyDescriptor;
        beforeEach('store arch', () => {
            arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        });
        afterEach('reset arch', () => {
            Object.defineProperty(process, 'arch', arch);
        });
        describe('x86', () => {
            beforeEach('set arch', () => {
                Object.defineProperty(process, 'arch', {
                    value: 'x32',
                });
            });
            it('fetches the install URL for x86 arch', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: {
                        x86: 'https://example.com/x86.msi',
                        x64: 'https://example.com/x64.msi',
                    },
                });
                expect((installer as any).installUrl).to.equal('https://example.com/x86.msi');
            });
            it('fetches the install URL if there is only one on x86', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: {
                        x64: 'https://example.com/x64.msi',
                    },
                });
                expect((installer as any).installUrl).to.equal('https://example.com/x64.msi');
            });
        });
        describe('x64', () => {
            beforeEach('set arch', () => {
                Object.defineProperty(process, 'arch', {
                    value: 'x64',
                });
            });
            it('fetches the install URL for x64 arch', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: {
                        x86: 'https://example.com/x86.msi',
                        x64: 'https://example.com/x64.msi',
                    },
                });
                expect((installer as any).installUrl).to.equal('https://example.com/x64.msi');
            });
            it('fetches the install URL if there is only one on x64', () => {
                const installer = new MsiInstaller({
                    name: 'test',
                    version: '1.0.0',
                    urls: {
                        x86: 'https://example.com/x86.msi',
                    },
                });
                expect((installer as any).installUrl).to.equal('https://example.com/x86.msi');
            });
        });
    });
    describe('.install()', () => {
        it('returns a cached path if found', async () => {
            stubTc.find.returns('C:/cache/test/x86');
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                },
            });
            await installer.install();
            expect(stubTc.downloadTool).to.have.callCount(0);
            expect(stubTc.cacheFile).to.have.callCount(0);
            expect(stubExec.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/cache/test/x86/test.msi',
            ], { windowsVerbatimArguments: true });
        });
        it('downloads the tool if no cached path if found', async () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                },
            });
            await installer.install();
            expect(stubTc.downloadTool).to.have.callCount(1);
            expect(stubTc.cacheFile).to.have.callCount(1);
            expect(stubExec.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/cache/installer/test.msi',
            ], { windowsVerbatimArguments: true });
        });
        it('installs with APPGUID option if supplied', async () => {
            const appGuid = randomUUID();
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                },
                appGuid,
            });
            await installer.install();
            expect(stubTc.downloadTool).to.have.callCount(1);
            expect(stubTc.cacheFile).to.have.callCount(1);
            expect(stubExec.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/cache/installer/test.msi',
                `APPGUID={${appGuid}}`,
            ], { windowsVerbatimArguments: true });
        });
        it('installs without /passive flag if not silent', async () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                },
                silent: false,
            });
            await installer.install();
            expect(stubTc.downloadTool).to.have.callCount(1);
            expect(stubTc.cacheFile).to.have.callCount(1);
            expect(stubExec.exec).to.have.been.calledOnceWith('msiexec', [
                '/i',
                'C:/cache/installer/test.msi',
            ], { windowsVerbatimArguments: true });
        });
        it('installs with extra supplied args', async () => {
            const installer = new MsiInstaller({
                name: 'test',
                version: '1.0.0',
                urls: {
                    x86: 'https://example.com/x86.msi',
                },
                extraArgs: ['REINSTALL="ALL"'],
            });
            await installer.install();
            expect(stubTc.downloadTool).to.have.callCount(1);
            expect(stubTc.cacheFile).to.have.callCount(1);
            expect(stubExec.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/cache/installer/test.msi',
                'REINSTALL="ALL"',
            ], { windowsVerbatimArguments: true });
        });
    });
});

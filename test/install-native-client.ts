import { match, restore, SinonStubbedInstance, stub } from 'sinon';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import installNativeClient from '../src/install-native-client';
import { expect, use } from 'chai';
import sinonChai from 'sinon-chai';
use(sinonChai);

describe('install-native-client', () => {
    // let coreStub: SinonStubbedInstance<typeof core>;
    let tcStub: SinonStubbedInstance<typeof tc>;
    let execStub: SinonStubbedInstance<typeof exec>;
    let ioStub: SinonStubbedInstance<typeof io>;
    let arch: PropertyDescriptor;
    beforeEach('stub deps', () => {
        stub(core);
        arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
        tcStub = stub(tc);
        tcStub.find.returns('');
        execStub = stub(exec);
        execStub.exec.resolves();
        ioStub = stub(io);
        ioStub.mv.resolves();
    });
    afterEach('restore stubs', () => {
        Object.defineProperty(process, 'arch', arch);
        restore();
    });
    describe('.installNativeClient()', () => {
        it('throws for bad version', async () => {
            try {
                await installNativeClient('10');
            } catch (e) {
                expect(e).to.have.property('message', 'Invalid native client version supplied 10. Must be one of 11.');
                return;
            }
            expect.fail('expected to throw');
        });
        it('installs from cache', async () => {
            tcStub.find.returns('C:/tmp/');
            await installNativeClient('11');
            expect(tcStub.downloadTool).to.have.callCount(0);
            expect(execStub.exec).to.have.been.calledOnceWith('msiexec', match.array, {
                windowsVerbatimArguments: true,
            });
            expect(execStub.exec.firstCall.args[1]).to.contain('C:/tmp/sqlncli.msi');
        });
        it('installs from web (x64)', async () => {
            Object.defineProperty(process, 'arch', {
                value: 'x64',
            });
            tcStub.cacheFile.resolves('C:/tmp/cache/');
            tcStub.downloadTool.resolves('C:/tmp/downloads');
            await installNativeClient('11');
            expect(tcStub.downloadTool).to.have.been.calledOnceWith('https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x64/sqlncli.msi');
            expect(tcStub.cacheFile).to.have.callCount(1);
            expect(execStub.exec).to.have.been.calledOnceWith('msiexec', match.array, {
                windowsVerbatimArguments: true,
            });
            expect(execStub.exec.firstCall.args[1]).to.contain('C:/tmp/cache/sqlncli.msi');
        });
        it('installs from web (x32)', async () => {
            Object.defineProperty(process, 'arch', {
                value: 'x32',
            });
            tcStub.cacheFile.resolves('C:/tmp/cache/');
            tcStub.downloadTool.resolves('C:/tmp/downloads');
            await installNativeClient('11');
            expect(tcStub.downloadTool).to.have.been.calledOnceWith('https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x86/sqlncli.msi');
            expect(tcStub.cacheFile).to.have.callCount(1);
            expect(execStub.exec).to.have.been.calledOnceWith('msiexec', match.array, {
                windowsVerbatimArguments: true,
            });
            expect;
            expect(execStub.exec.firstCall.args[1]).to.contain('C:/tmp/cache/sqlncli.msi');
        });
    });
});

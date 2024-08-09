import { restore, SinonStubbedInstance, stub } from 'sinon';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import { expect, use } from 'chai';
import sinonChai from 'sinon-chai';
import installOdbc from '../src/install-odbc';
use(sinonChai);

describe('install-odbc', () => {
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
    describe('.installOdbc()', () => {
        it('throws for bad version', async () => {
            try {
                await installOdbc('10');
            } catch (e) {
                expect(e).to.have.property('message', 'Invalid ODBC version supplied 10. Must be one of 18, 17.');
                return;
            }
            expect.fail('expected to throw');
        });
        it('installs from cache', async () => {
            tcStub.find.returns('C:/tmp/');
            await installOdbc('18');
            expect(tcStub.downloadTool).to.have.callCount(0);
            expect(execStub.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/tmp/msodbcsql.msi',
                'IACCEPTMSODBCSQLLICENSETERMS=YES',
            ], {
                windowsVerbatimArguments: true,
            });
        });
        it('installs from web (x64)', async () => {
            Object.defineProperty(process, 'arch', {
                value: 'x64',
            });
            tcStub.cacheFile.resolves('C:/tmp/cache/');
            tcStub.downloadTool.resolves('C:/tmp/downloads');
            await installOdbc('17');
            expect(tcStub.downloadTool).to.have.been.calledOnceWith('https://go.microsoft.com/fwlink/?linkid=2239168');
            expect(tcStub.cacheFile).to.have.callCount(1);
            expect(execStub.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/tmp/cache/msodbcsql.msi',
                'IACCEPTMSODBCSQLLICENSETERMS=YES',
            ], {
                windowsVerbatimArguments: true,
            });
        });
        it('installs from web (x32)', async () => {
            Object.defineProperty(process, 'arch', {
                value: 'x32',
            });
            tcStub.cacheFile.resolves('C:/tmp/cache/');
            tcStub.downloadTool.resolves('C:/tmp/downloads');
            await installOdbc('17');
            expect(tcStub.downloadTool).to.have.been.calledOnceWith('https://go.microsoft.com/fwlink/?linkid=2238791');
            expect(tcStub.cacheFile).to.have.callCount(1);
            expect(execStub.exec).to.have.been.calledOnceWith('msiexec', [
                '/passive',
                '/i',
                'C:/tmp/cache/msodbcsql.msi',
                'IACCEPTMSODBCSQLLICENSETERMS=YES',
            ], {
                windowsVerbatimArguments: true,
            });
        });
    });
});

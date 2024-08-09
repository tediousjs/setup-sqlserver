import os from 'node:os';
import fs from 'fs/promises';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import { match, restore, SinonStubbedInstance, stub, useFakeTimers } from 'sinon';
import { expect, use } from 'chai';
import sinonChai from 'sinon-chai';
import * as versions from '../src/versions';
import * as nativeClient from '../src/install-native-client';
import * as odbcDriver from '../src/install-odbc';
import * as utils from '../src/utils';
import install from '../src/install';
use(sinonChai);

describe('install', () => {
    let reverts: (() => void)[] = [];
    let versionStub: SinonStubbedInstance<Map<string, versions.VersionConfig>>;
    let osStub: SinonStubbedInstance<typeof os>;
    let coreStub: SinonStubbedInstance<typeof core>;
    let utilsStub: SinonStubbedInstance<typeof utils>;
    let tcStub: SinonStubbedInstance<typeof tc>;
    let execStub: SinonStubbedInstance<typeof exec>;
    let stubNc: SinonStubbedInstance<typeof nativeClient>;
    let stubOdbc: SinonStubbedInstance<typeof odbcDriver>;
    beforeEach('stub deps', () => {
        stubNc = stub(nativeClient);
        stubOdbc = stub(odbcDriver);
        versionStub = stub(versions.VERSIONS);
        versionStub.keys.returns(['box', 'exe', 'maxOs', 'minOs', 'minMaxOs'][Symbol.iterator]());
        versionStub.has.callsFake((name) => {
            return ['box', 'exe', 'maxOs', 'minOs', 'minMaxOs'].includes(name);
        });
        versionStub.get.withArgs('box').returns({
            version: '2022',
            exeUrl: 'https://example.com/installer.exe',
            boxUrl: 'https://example.com/installer.box',
            updateUrl: 'https://example.com/update.html',
        });
        versionStub.get.withArgs('exe').returns({
            version: '2019',
            exeUrl: 'https://example.com/setup.exe',
            updateUrl: 'https://example.com/update.exe',
        });
        versionStub.get.withArgs('maxOs').returns({
            version: '2017',
            exeUrl: 'https://example.com/setup.exe',
            osSupport: {
                max: 2019,
            },
        });
        versionStub.get.withArgs('minOs').returns({
            version: '2017',
            exeUrl: 'https://example.com/setup.exe',
            osSupport: {
                min: 2022,
            },
        });
        versionStub.get.withArgs('minMaxOs').returns({
            version: '2017',
            exeUrl: 'https://example.com/setup.exe',
            osSupport: {
                min: 2019,
                max: 2022,
            },
        });
        utilsStub = stub(utils);
        utilsStub.gatherInputs.returns({
            version: 'box',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        utilsStub.getOsVersion.resolves(2022);
        utilsStub.gatherSummaryFiles.resolves([]);
        utilsStub.downloadExeInstaller.resolves('C:/tmp/exe/setup.exe');
        utilsStub.downloadBoxInstaller.resolves('C:/tmp/box/setup.exe');
        utilsStub.downloadUpdateInstaller.resolves('C:/tmp/exe/sqlupdate.exe');
        utilsStub.waitForDatabase.resolves(0);
        osStub = stub(os);
        osStub.platform.returns('win32');
        coreStub = stub(core);
        coreStub.group.callsFake((message, cb) => {
            return cb();
        });
        tcStub = stub(tc);
        tcStub.find.returns('');
        execStub = stub(exec);
        execStub.exec.resolves();
    });
    afterEach('revert stubs', () => {
        restore();
        reverts.forEach((revert) => revert());
        reverts = [];
    });
    it('fails if bad os', async () => {
        osStub.platform.returns('linux');
        try {
            await install();
        } catch (e) {
            expect(e).to.have.property('message', 'setup-sqlserver only supports Windows runners, got: linux');
            return;
        }
        expect.fail('expected to throw');
    });
    it('fails if bad sql version', async () => {
        utilsStub.gatherInputs.returns({
            version: 'missing',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        try {
            await install();
        } catch (e) {
            expect(e).to.have.property('message', 'Unsupported SQL Version, supported versions are box, exe, maxOs, minOs, minMaxOs, got: missing');
            return;
        }
        expect.fail('expected to throw');
    });
    it('runs a box install', async () => {
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/box/setup.exe"', match.array, { windowsVerbatimArguments: true });
    });
    it('runs an exe install', async () => {
        utilsStub.gatherInputs.returns({
            version: 'exe',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
    });
    it('downloads cumulative updates', async () => {
        utilsStub.gatherInputs.returns({
            version: 'exe',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: true,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
        expect(execStub.exec.firstCall.args[1]).to.contain.members([
            '/UPDATEENABLED=1',
            '/UpdateSource=C:/tmp/exe',
        ]);
    });
    it('uses cached updates if found', async () => {
        tcStub.find.withArgs('sqlupdate').returns('C:/tool-cache/sql-update');
        utilsStub.gatherInputs.returns({
            version: 'exe',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: true,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
        expect(execStub.exec.firstCall.args[1]).to.contain.members([
            '/UPDATEENABLED=1',
            '/UpdateSource=C:/tool-cache/sql-update',
        ]);
    });
    it('skips cumulative updates if no update url', async () => {
        utilsStub.gatherInputs.returns({
            version: 'minOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: true,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
        expect(execStub.exec.firstCall.args[1]).to.not.contain.members([
            '/UPDATEENABLED=1',
            '/UpdateSource=C:/tmp/exe',
        ]);
    });
    it('uses cached tool if found', async () => {
        tcStub.find.withArgs('sqlserver').returns('C:/tool-cache/sql-server');
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tool-cache/sql-server/setup.exe"', match.array, { windowsVerbatimArguments: true });
    });
    it('errors on os max support', async () => {
        utilsStub.gatherInputs.returns({
            version: 'maxOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        try {
            await install();
        } catch (e) {
            expect(e).to.have.property('message', 'Runner version windows-2022 is not supported for SQL Server maxOs. Please use windows-2019.');
            return;
        }
        expect.fail('expected to throw');
    });
    it('errors on os min support', async () => {
        utilsStub.getOsVersion.resolves(2019);
        utilsStub.gatherInputs.returns({
            version: 'minOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        try {
            await install();
        } catch (e) {
            expect(e).to.have.property('message', 'Runner version windows-2019 is not supported for SQL Server minOs. Please use windows-2022.');
            return;
        }
        expect.fail('expected to throw');
    });
    it('errors on os min & max support', async () => {
        utilsStub.getOsVersion.resolves(2016);
        utilsStub.gatherInputs.returns({
            version: 'minMaxOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        try {
            await install();
        } catch (e) {
            expect(e).to.have.property('message', 'Runner version windows-2016 is not supported for SQL Server minMaxOs. Please use windows-2019 to windows-2022.');
            return;
        }
        expect.fail('expected to throw');
    });
    it('continues if no os version found', async () => {
        utilsStub.getOsVersion.resolves(null);
        utilsStub.gatherInputs.returns({
            version: 'maxOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
    });
    it('continues if os version is good', async () => {
        utilsStub.getOsVersion.resolves(2019);
        utilsStub.gatherInputs.returns({
            version: 'maxOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
    });
    it('skips os checks when needed', async () => {
        utilsStub.gatherInputs.returns({
            version: 'maxOs',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: true,
            skipOsCheck: true,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        await install();
        expect(execStub.exec).to.have.been.calledWith('"C:/tmp/exe/setup.exe"', match.array, { windowsVerbatimArguments: true });
    });
    it('waits for max of 10 attempts', async () => {
        const clock = useFakeTimers();
        stub(clock, 'setTimeout').yields();
        utilsStub.waitForDatabase.resolves(1);
        await install();
        expect(utilsStub.waitForDatabase).to.have.callCount(6);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 1000);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 2000);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 4000);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 8000);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 16000);
    });
    it('waits until db is ready', async () => {
        const clock = useFakeTimers();
        stub(clock, 'setTimeout').yields();
        utilsStub.waitForDatabase.resolves(1);
        utilsStub.waitForDatabase.onThirdCall().resolves(0);
        await install();
        expect(utilsStub.waitForDatabase).to.have.callCount(3);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 1000);
        expect(clock.setTimeout).to.have.been.calledWith(match.any, 2000);
    });
    it('fetches summary files', async () => {
        utilsStub.gatherInputs.returns({
            version: 'box',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: false,
            skipOsCheck: false,
            nativeClientVersion: '',
            odbcVersion: '',
            installUpdates: false,
        });
        const stubReadfile = stub(fs, 'readFile');
        stubReadfile.resolves(Buffer.from('test data'));
        utilsStub.gatherSummaryFiles.resolves(['C:/tmp/summary.txt']);
        await install();
        expect(coreStub.startGroup).calledOnceWith('summary.txt');
        expect(coreStub.info).calledWith('test data');
        expect(coreStub.endGroup).has.callCount(1);
    });
    it('fetches summary files with details on errors', async () => {
        const stubReadfile = stub(fs, 'readFile');
        stubReadfile.resolves(Buffer.from('test data'));
        utilsStub.gatherSummaryFiles.resolves(['C:/tmp/summary.txt']);
        execStub.exec.rejects(new Error('synthetic error'));
        try {
            await install();
        } catch (e) {
            expect(e).to.have.property('message', 'synthetic error');
            expect(utilsStub.gatherSummaryFiles).to.have.been.calledOnceWith(true);
            expect(coreStub.startGroup).calledOnceWith('summary.txt');
            expect(coreStub.info).calledOnceWith('test data');
            expect(coreStub.endGroup).has.callCount(1);
            return;
        }
        expect.fail('expected to throw');
    });
    it('fetches summary detail files during debug', async () => {
        const stubReadfile = stub(fs, 'readFile');
        stubReadfile.resolves(Buffer.from('test data'));
        utilsStub.gatherSummaryFiles.resolves(['C:/tmp/summary.txt']);
        coreStub.isDebug.returns(true);
        await install();
        expect(utilsStub.gatherSummaryFiles).to.have.been.calledOnceWith(true);
        expect(coreStub.info).calledWith('test data');
    });
    it('installs native client if needed', async () => {
        utilsStub.gatherInputs.returns({
            version: 'box',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: false,
            skipOsCheck: false,
            nativeClientVersion: '11',
            odbcVersion: '',
            installUpdates: false,
        });
        await install();
        expect(stubNc.default).to.have.been.calledOnceWith('11');
    });
    it('installs odbc driver if needed', async () => {
        utilsStub.gatherInputs.returns({
            version: 'box',
            password: 'secret password',
            collation: 'SQL_Latin1_General_CP1_CI_AS',
            installArgs: [],
            wait: false,
            skipOsCheck: false,
            nativeClientVersion: '11',
            odbcVersion: '18',
            installUpdates: false,
        });
        await install();
        expect(stubNc.default).to.have.been.calledOnceWith('11');
        expect(stubOdbc.default).to.have.been.calledOnceWith('18');
    });
});

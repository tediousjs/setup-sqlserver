import { randomBytes, randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as io from '@actions/io';
import * as glob from '@actions/glob';
import * as http from '@actions/http-client';
import { Globber } from '@actions/glob';
import { stub, restore, SinonStubbedMember, SinonStubbedInstance, SinonStub, createStubInstance } from 'sinon';
import { expect, use } from 'chai';
import sinonChai from 'sinon-chai';
import * as utils from '../src/utils';
import * as crypto from '../src/crypto';
use(sinonChai);

describe('utils', () => {
    let coreStub: SinonStubbedInstance<typeof core>;
    let platformStub: SinonStubbedInstance<typeof core.platform>;
    beforeEach('stub core', () => {
        platformStub = stub(core.platform);
        coreStub = stub(core);
    });
    afterEach('restore stubs', () => {
        restore();
    });
    describe('.getOsVersion()', () => {
        beforeEach('stub debs', () => {
            platformStub.getDetails.resolves({
                name: 'Microsoft Windows Server 2019 Datacenter',
                platform: 'win32',
                arch: 'x64',
                version: '10.0.17763',
                isWindows: true,
                isMacOS: false,
                isLinux: false,
            });
        });
        it('correctly returns for windows-2019', async () => {
            const out = await utils.getOsVersion();
            expect(out).to.equal(2019);
        });
        it('correctly returns for windows-2022', async () => {
            platformStub.getDetails.resolves({
                name: 'Microsoft Windows Server 2022 Datacenter',
                platform: 'win32',
                arch: 'x64',
                version: '10.0.20348',
                isWindows: true,
                isMacOS: false,
                isLinux: false,
            });
            const out = await utils.getOsVersion();
            expect(out).to.equal(2022);
        });
        it('adds output when debugging', async () => {
            coreStub.isDebug.returns(true);
            await utils.getOsVersion();
            expect(coreStub.isDebug).to.have.callCount(1);
            expect(coreStub.startGroup).to.have.been.calledOnceWith('systeminfo');
            expect(coreStub.debug).to.have.been.calledOnceWith("name: Microsoft Windows Server 2019 Datacenter\nplatform: win32\narch: x64\nversion: 10.0.17763\nisWindows: true\nisMacOS: false\nisLinux: false");
            expect(coreStub.endGroup).to.have.callCount(1);
        });
        it('fails gracefully when error is thrown', async () => {
            const err = new Error('synthetic error');
            platformStub.getDetails.rejects(err);
            const res = await utils.getOsVersion();
            expect(res).to.equal(null);
            expect(coreStub.warning).to.have.been.calledOnceWithExactly(err);
        });
        it('fails gracefully with bad output', async () => {
            platformStub.getDetails.resolves({
                name: 'not a number',
                platform: 'win32',
                arch: 'x64',
                version: '10.0.20348',
                isWindows: true,
                isMacOS: false,
                isLinux: false,
            });
            const res = await utils.getOsVersion();
            expect(res).to.equal(null);
        });
    });
    describe('.gatherInputs()', () => {
        it('constructs input object', () => {
            coreStub.getInput.withArgs('sqlserver-version').returns('sql-2022');
            coreStub.getInput.withArgs('sa-password').returns('secret password');
            coreStub.getInput.withArgs('db-collation').returns('SQL_Latin1_General_CP1_CI_AS');
            coreStub.getInput.withArgs('native-client-version').returns('');
            coreStub.getInput.withArgs('odbc-version').returns('');
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            coreStub.getBooleanInput.withArgs('install-updates').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
                nativeClientVersion: '',
                odbcVersion: '',
                installUpdates: false,
            });
        });
        it('constructs input object with no sql- prefix', () => {
            coreStub.getInput.withArgs('sqlserver-version').returns('2022');
            coreStub.getInput.withArgs('sa-password').returns('secret password');
            coreStub.getInput.withArgs('db-collation').returns('SQL_Latin1_General_CP1_CI_AS');
            coreStub.getInput.withArgs('native-client-version').returns('');
            coreStub.getInput.withArgs('odbc-version').returns('');
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            coreStub.getBooleanInput.withArgs('install-updates').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
                nativeClientVersion: '',
                odbcVersion: '',
                installUpdates: false,
            });
        });
        it('constructs input object with "latest" version', () => {
            coreStub.getInput.withArgs('sqlserver-version').returns('latest');
            coreStub.getInput.withArgs('sa-password').returns('secret password');
            coreStub.getInput.withArgs('db-collation').returns('SQL_Latin1_General_CP1_CI_AS');
            coreStub.getInput.withArgs('native-client-version').returns('');
            coreStub.getInput.withArgs('odbc-version').returns('');
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            coreStub.getBooleanInput.withArgs('install-updates').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
                nativeClientVersion: '',
                odbcVersion: '',
                installUpdates: false,
            });
        });
        it('constructs input object with default version', () => {
            coreStub.getInput.withArgs('sqlserver-version').returns('');
            coreStub.getInput.withArgs('sa-password').returns('secret password');
            coreStub.getInput.withArgs('db-collation').returns('SQL_Latin1_General_CP1_CI_AS');
            coreStub.getInput.withArgs('native-client-version').returns('');
            coreStub.getInput.withArgs('odbc-version').returns('');
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            coreStub.getBooleanInput.withArgs('install-updates').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
                nativeClientVersion: '',
                odbcVersion: '',
                installUpdates: false,
            });
        });
    });
    describe('.downloadTool()', () => {
        let downloadStub: SinonStubbedMember<typeof tc.downloadTool>;
        beforeEach('stub deps', () => {
            downloadStub = stub(tc, 'downloadTool');
            stub(io, 'mv').resolves();
        });
        it('downloads the tool', async () => {
            const fileName = randomUUID();
            downloadStub.withArgs('https://example.com/setup.exe').resolves(`C:/path/to/${fileName}`);
            const res = await utils.downloadTool('https://example.com/setup.exe');
            expect(res).to.equal(`C:/path/to/${fileName}.exe`);
        });
        it('downloads the tool with custom extension', async () => {
            const fileName = randomUUID();
            downloadStub.withArgs('https://example.com/setup.exe').resolves(`C:/path/to/${fileName}`);
            const res = await utils.downloadTool('https://example.com/setup.exe', '.html');
            expect(res).to.equal(`C:/path/to/${fileName}.html`);
        });
    });
    describe('.waitForDatabase()', () => {
        beforeEach('stub deps', () => {
            stub(exec, 'exec').resolves(0);
        });
        it('resolves', async () => {
            const res = await utils.waitForDatabase('password');
            expect(res).to.equal(0);
        });
    });
    describe('.downloadBoxInstaller()', () => {
        beforeEach('stub deps', () => {
            stub(tc, 'downloadTool').callsFake(() => Promise.resolve(`C:/tmp/${randomUUID()}`));
            stub(exec, 'exec').resolves(0);
            stub(io, 'mv').resolves();
            stub(tc, 'cacheDir').callsFake(() => Promise.resolve(`C:/tools/${randomUUID()}`));
            stub(crypto, 'generateFileHash').callsFake(() => Promise.resolve(randomBytes(32)));
        });
        it('returns a path to an exe', async () => {
            const res = await utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            });
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
        it('throws if no boxUrl', async () => {
            try {
                await utils.downloadBoxInstaller({
                    exeUrl: 'https://example.com/installer.exe',
                    version: '2016',
                });
            } catch (e) {
                expect(e).to.have.property('message', 'No boxUrl provided');
                return;
            }
            expect.fail('expected to fail');
        });
        it('calculates digests in debug mode', async () => {
            coreStub.isDebug.returns(true);
            const res = await utils.downloadBoxInstaller({
                exeUrl: 'https://example.com/installer.exe',
                boxUrl: 'https://example.com/installer.box',
                version: '2022',
            });
            const calls = coreStub.debug.getCalls().filter(({ firstArg }) => {
                return firstArg.startsWith('Got setup file');
            });
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
            expect(calls).to.have.lengthOf(2);
            expect(calls[0].firstArg).to.match(/^Got setup file \(exe\) with hash SHA256=/);
            expect(calls[1].firstArg).to.match(/^Got setup file \(box\) with hash SHA256=/);
        });
    });
    describe('.downloadExeInstaller()', () => {
        beforeEach('stub deps', () => {
            stub(tc, 'downloadTool').callsFake(() => Promise.resolve(`C:/tmp/${randomUUID()}`));
            stub(exec, 'exec').resolves(0);
            stub(io, 'mv').resolves();
            stub(tc, 'cacheFile').callsFake(() => Promise.resolve(`C:/tools/${randomUUID()}`));
            stub(crypto, 'generateFileHash').callsFake(() => Promise.resolve(randomBytes(32)));
        });
        it('returns a path to an exe', async () => {
            const res = await utils.downloadExeInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
            });
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
        it('throws if boxUrl', async () => {
            try {
                await utils.downloadExeInstaller({
                    exeUrl: 'https://example.com/installer.exe',
                    boxUrl: 'https://example.com/installer.box',
                    version: '2016',
                });
            } catch (e) {
                expect(e).to.have.property('message', 'Version requires box installer');
                return;
            }
            expect.fail('expected to fail');
        });
        it('calculates digests in debug mode', async () => {
            coreStub.isDebug.returns(true);
            const res = await utils.downloadExeInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
            });
            const calls = coreStub.debug.getCalls().filter(({ firstArg }) => {
                return firstArg.startsWith('Got setup file');
            });
            expect(calls).to.have.lengthOf(1);
            expect(calls[0].firstArg).to.match(/^Got setup file \(exe\) with hash SHA256=/);
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/setup\.exe$/);
        });
    });
    describe('.downloadUpdateInstaller()', () => {
        let stubClient: SinonStubbedInstance<http.HttpClient>;
        let stubResponse: SinonStubbedInstance<http.HttpClientResponse>;
        beforeEach('stub deps', () => {
            stub(tc, 'downloadTool').callsFake(() => Promise.resolve(`C:/tmp/${randomUUID()}`));
            stub(exec, 'exec').resolves(0);
            stub(io, 'mv').resolves();
            stub(tc, 'cacheFile').callsFake(() => Promise.resolve(`C:/tools/${randomUUID()}`));
            stub(crypto, 'generateFileHash').callsFake(() => Promise.resolve(randomBytes(32)));
            stubResponse = createStubInstance(http.HttpClientResponse, {
                readBody: stub<[]>().resolves('<a href="https://download.microsoft.com/update.exe">'),
            });
            stubResponse.message = { statusCode: 200 } as IncomingMessage;
            stubClient = createStubInstance(http.HttpClient, {
                get: stub<[url: string]>().resolves(stubResponse),
            });
            stub(http, 'HttpClient').returns(stubClient);
        });
        it('returns a path to an exe', async () => {
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/where-are-updates.html',
            });
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
        });
        it('throws if no update url', async () => {
            try {
                await utils.downloadUpdateInstaller({
                    exeUrl: 'https://example.com/installer.exe',
                    boxUrl: 'https://example.com/installer.box',
                    version: '2016',
                });
            } catch (e) {
                expect(e).to.have.property('message', 'No update url provided');
                return;
            }
            expect.fail('expected to fail');
        });
        it('calculates digests in debug mode', async () => {
            coreStub.isDebug.returns(true);
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/where-are-updates.html',
            });
            const calls = coreStub.debug.getCalls().filter(({ firstArg }) => {
                return firstArg.startsWith('Got update file');
            });
            expect(calls).to.have.lengthOf(1);
            expect(calls[0].firstArg).to.match(/^Got update file with hash SHA256=/);
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
        });
        it('uses an .exe url directly', async () => {
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/sqlupdate.exe',
            });
            expect(res).to.match(/^C:\/tools\/[a-f0-9-]*\/sqlupdate\.exe$/);
            expect(stubClient.get).to.have.callCount(0);
        });
        it('returns empty string if URL is not resolved', async () => {
            stubResponse.readBody.resolves('<a href="https://example.com/update.exe">');
            const res = await utils.downloadUpdateInstaller({
                exeUrl: 'https://example.com/installer.exe',
                version: '2022',
                updateUrl: 'https://example.com/sqlupdate.html',
            });
            expect(res).to.equal('');
            expect(stubClient.get).to.have.callCount(1);
        });
    });
    describe('.gatherSummaryFiles()', () => {
        let globStub: SinonStubbedInstance<typeof glob>;
        let globFunc: SinonStub<[], string[]>;
        beforeEach('stub deps', () => {
            globFunc = stub<[], string[]>().resolves([]);
            globStub = stub(glob);
            globStub.create.resolves({
                glob: globFunc,
            } as unknown as Globber);
        });
        it('returns empty array if no files matched', async () => {
            const res = await utils.gatherSummaryFiles();
            expect(res).to.deep.equal([]);
        });
        it('returns found files', async () => {
            globFunc.onFirstCall().resolves(['C:/tmp/summary.txt']);
            const res = await utils.gatherSummaryFiles();
            expect(res).to.deep.equal(['C:/tmp/summary.txt']);
            expect(glob.create).to.have.callCount(1);
        });
        it('tries to find details files', async () => {
            globFunc.onFirstCall().resolves(['C:/tmp/summary.txt']);
            const res = await utils.gatherSummaryFiles(true);
            expect(res).to.deep.equal(['C:/tmp/summary.txt']);
            expect(glob.create).to.have.callCount(2);
        });
        it('finds detail file', async () => {
            globFunc.onFirstCall().resolves(['C:/tmp/summary.txt']);
            globFunc.onSecondCall().resolves(['C:/tmp/2021/details.txt', 'C:/tmp/2022/details.txt']);
            const res = await utils.gatherSummaryFiles(true);
            expect(res).to.deep.equal(['C:/tmp/summary.txt', 'C:/tmp/2022/details.txt']);
            expect(glob.create).to.have.callCount(2);
        });
    });
});

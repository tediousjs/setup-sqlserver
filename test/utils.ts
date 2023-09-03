import * as utils from '../src/utils';
import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as io from '@actions/io';
import * as glob from '@actions/glob';
import { stub, restore, SinonStubbedMember, SinonStubbedInstance, SinonStub } from 'sinon';
import { expect, use } from 'chai';
import sinonChai from 'sinon-chai';
import { randomBytes, randomUUID } from 'crypto';
import * as crypto from '../src/crypto';
import { Globber } from '@actions/glob';
import { gatherSummaryFiles } from '../src/utils';
use(sinonChai);

const windows2022 = `
  Host Name:                 fv-az618-92
  OS Name:                   Microsoft Windows Server 2022 Datacenter
  OS Version:                10.0.20348 N/A Build 20348
  OS Manufacturer:           Microsoft Corporation
  OS Configuration:          Standalone Server
  OS Build Type:             Multiprocessor Free
  Registered Owner:          N/A
  Registered Organization:   N/A
  Product ID:                00454-60000-00001-AA926
  Original Install Date:     8/8/2023, 9:08:26 AM
  System Boot Time:          8/9/2023, 3:13:18 PM
  System Manufacturer:       Microsoft Corporation
  System Model:              Virtual Machine
  System Type:               x64-based PC
  Processor(s):              1 Processor(s) Installed.
                             [01]: Intel64 Family 6 Model 79 Stepping 1 GenuineIntel ~2295 Mhz
  BIOS Version:              American Megatrends Inc. 090008 , 12/7/2018
  Windows Directory:         C:\\Windows
  System Directory:          C:\\Windows\\system32
  Boot Device:               \\Device\\HarddiskVolume1
  System Locale:             en-us;English (United States)
  Input Locale:              en-us;English (United States)
  Time Zone:                 (UTC) Coordinated Universal Time
  Total Physical Memory:     7,168 MB
  Available Physical Memory: 5,426 MB
  Virtual Memory: Max Size:  8,959 MB
  Virtual Memory: Available: 7,373 MB
  Virtual Memory: In Use:    1,586 MB
  Page File Location(s):     D:\\pagefile.sys
  Domain:                    WORKGROUP
  Logon Server:              \\\\fv-az618-92
  Hotfix(s):                 5 Hotfix(s) Installed.
                             [01]: KB5028852
                             [02]: KB5028858
                             [03]: KB5011048
                             [04]: KB5028171
                             [05]: KB5028317
  Network Card(s):           1 NIC(s) Installed.
                             [01]: Microsoft Hyper-V Network Adapter
                                   Connection Name: Ethernet
                                   DHCP Enabled:    Yes
                                   DHCP Server:     168.63.129.16
                                   IP address(es)
                                   [01]: 10.1.0.141
                                   [02]: fe80::deb6:64f:8300:ef77
  Hyper-V Requirements:      A hypervisor has been detected. Features required for Hyper-V will not be displayed.
`;

const windows2019 = `
  Host Name:                 fv-az276-691
  OS Name:                   Microsoft Windows Server 2019 Datacenter
  OS Version:                10.0.17763 N/A Build 17763
  OS Manufacturer:           Microsoft Corporation
  OS Configuration:          Standalone Server
  OS Build Type:             Multiprocessor Free
  Registered Owner:          N/A
  Registered Organization:   N/A
  Product ID:                00430-00000-00000-AA138
  Original Install Date:     8/3/2023, 10:11:03 AM
  System Boot Time:          8/9/2023, 3:19:20 PM
  System Manufacturer:       Microsoft Corporation
  System Model:              Virtual Machine
  System Type:               x64-based PC
  Processor(s):              1 Processor(s) Installed.
                             [01]: Intel64 Family 6 Model 63 Stepping 2 GenuineIntel ~2394 Mhz
  BIOS Version:              American Megatrends Inc. 090008 , 12/7/2018
  Windows Directory:         C:\\Windows
  System Directory:          C:\\Windows\\system32
  Boot Device:               \\Device\\HarddiskVolume1
  System Locale:             en-us;English (United States)
  Input Locale:              en-us;English (United States)
  Time Zone:                 (UTC) Coordinated Universal Time
  Total Physical Memory:     7,168 MB
  Available Physical Memory: 5,543 MB
  Virtual Memory: Max Size:  8,959 MB
  Virtual Memory: Available: 7,426 MB
  Virtual Memory: In Use:    1,533 MB
  Page File Location(s):     D:\\pagefile.sys
  Domain:                    WORKGROUP
  Logon Server:              \\\\fv-az276-691
  Hotfix(s):                 6 Hotfix(s) Installed.
                             [01]: KB5028855
                             [02]: KB4486153
                             [03]: KB4589208
                             [04]: KB5004424
                             [05]: KB5028168
                             [06]: KB5028316
  Network Card(s):           2 NIC(s) Installed.
                             [01]: Hyper-V Virtual Ethernet Adapter
                                   Connection Name: vEthernet (nat)
                                   DHCP Enabled:    No
                                   IP address(es)
                                   [01]: 172.27.224.1
                                   [02]: fe80::39cd:87ac:c9ad:cd5e
                             [02]: Microsoft Hyper-V Network Adapter
                                   Connection Name: Ethernet 2
                                   DHCP Enabled:    Yes
                                   DHCP Server:     168.63.129.16
                                   IP address(es)
                                   [01]: 10.1.36.0
                                   [02]: fe80::ae04:627e:a23b:d046
  Hyper-V Requirements:      A hypervisor has been detected. Features required for Hyper-V will not be displayed.
`;
describe('utils', () => {
    let coreStub: SinonStubbedInstance<typeof core>;
    beforeEach('stub core', () => {
        coreStub = stub(core);
    });
    afterEach('restore stubs', () => {
        restore();
    });
    describe('.getOsVersion()', () => {
        let getExecOutput: SinonStubbedMember<typeof exec.getExecOutput>;
        beforeEach('stub debs', () => {
            getExecOutput = stub(exec, 'getExecOutput');
            getExecOutput.withArgs('systeminfo').resolves({
                exitCode: 0,
                stdout: windows2019,
                stderr: '',
            });
        });
        it('correctly returns for windows-2019', async () => {
            const out = await utils.getOsVersion();
            expect(out).to.equal(2019);
        });
        it('correctly returns for windows-2022', async () => {
            getExecOutput.withArgs('systeminfo').resolves({
                exitCode: 0,
                stdout: windows2022,
                stderr: '',
            });
            const out = await utils.getOsVersion();
            expect(out).to.equal(2022);
        });
        it('adds output when debugging', async () => {
            coreStub.isDebug.returns(true);
            await utils.getOsVersion();
            expect(coreStub.isDebug).to.have.callCount(1);
            expect(coreStub.startGroup).to.have.been.calledOnceWith('systeminfo');
            expect(coreStub.debug).to.have.been.calledOnceWith(windows2019);
            expect(coreStub.endGroup).to.have.callCount(1);
        });
        it('fails gracefully when error is thrown', async () => {
            const err = new Error('synthetic error');
            getExecOutput.withArgs('systeminfo').rejects(err);
            const res = await utils.getOsVersion();
            expect(res).to.equal(null);
            expect(coreStub.warning).to.have.been.calledOnceWithExactly(err);
        });
        it('fails gracefully with bad output', async () => {
            getExecOutput.withArgs('systeminfo').resolves({
                exitCode: 0,
                stdout: 'os name: not a number',
                stderr: '',
            });
            const res = await utils.getOsVersion();
            expect(res).to.equal(null);
        });
        it('fails gracefully with no output', async () => {
            getExecOutput.withArgs('systeminfo').resolves({
                exitCode: 0,
                stdout: '',
                stderr: '',
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
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
            });
        });
        it('constructs input object with no sql- prefix', () => {
            coreStub.getInput.withArgs('sqlserver-version').returns('2022');
            coreStub.getInput.withArgs('sa-password').returns('secret password');
            coreStub.getInput.withArgs('db-collation').returns('SQL_Latin1_General_CP1_CI_AS');
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
            });
        });
        it('constructs input object with "latest" version', () => {
            coreStub.getInput.withArgs('sqlserver-version').returns('latest');
            coreStub.getInput.withArgs('sa-password').returns('secret password');
            coreStub.getInput.withArgs('db-collation').returns('SQL_Latin1_General_CP1_CI_AS');
            coreStub.getMultilineInput.withArgs('install-arguments').returns([]);
            coreStub.getBooleanInput.withArgs('wait-for-ready').returns(true);
            coreStub.getBooleanInput.withArgs('skip-os-check').returns(false);
            const res = utils.gatherInputs();
            expect(res).to.deep.equal({
                version: '2022',
                password: 'secret password',
                collation: 'SQL_Latin1_General_CP1_CI_AS',
                installArgs: [],
                wait: true,
                skipOsCheck: false,
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
            const res = await gatherSummaryFiles();
            expect(res).to.deep.equal([]);
        });
        it('returns found files', async () => {
            globFunc.onFirstCall().resolves(['C:/tmp/summary.txt']);
            const res = await gatherSummaryFiles();
            expect(res).to.deep.equal(['C:/tmp/summary.txt']);
            expect(glob.create).to.have.callCount(1);
        });
        it('tries to find details files', async () => {
            globFunc.onFirstCall().resolves(['C:/tmp/summary.txt']);
            const res = await gatherSummaryFiles(true);
            expect(res).to.deep.equal(['C:/tmp/summary.txt']);
            expect(glob.create).to.have.callCount(2);
        });
        it('finds detail file', async () => {
            globFunc.onFirstCall().resolves(['C:/tmp/summary.txt']);
            globFunc.onSecondCall().resolves(['C:/tmp/2021/details.txt', 'C:/tmp/2022/details.txt']);
            const res = await gatherSummaryFiles(true);
            expect(res).to.deep.equal(['C:/tmp/summary.txt', 'C:/tmp/2022/details.txt']);
            expect(glob.create).to.have.callCount(2);
        });
    });
});

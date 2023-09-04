import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import { downloadTool } from './utils';
import { join as joinPaths } from 'path';

const x64_URL = 'https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x64/sqlncli.msi';
const x86_URL = 'https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x86/sqlncli.msi';

export default async function installNativeClient(version: number) {
    if (version !== 11) {
        throw new Error('Unsupported Native Client version, only 11 is valid.');
    }
    const arch = process.arch === 'x64' ? 'x64' : 'x86';
    let path = tc.find('sqlncli', '11.0', arch);
    if (!path) {
        core.info(`Downloading client installer for ${arch}.`);
        path = await downloadTool(arch === 'x64' ? x64_URL : x86_URL).then((tmp) => {
            return tc.cacheFile(tmp, 'sqlncli.msi', 'sqlncli', '11.0', arch);
        });
    } else {
        core.info('Loaded client installer from cache.');
    }
    path = joinPaths(path, 'sqlncli.msi');
    core.info('Installing SQL Native Client 11.0');
    // see https://learn.microsoft.com/en-us/previous-versions/sql/sql-server-2012/ms131321(v=sql.110)
    await exec.exec('msiexec', [
        '/passive',
        '/i',
        path,
        'APPGUID={0CC618CE-F36A-415E-84B4-FB1BFF6967E1}',
        'IACCEPTSQLNCLILICENSETERMS=YES',
    ], {
        windowsVerbatimArguments: true,
    });
}

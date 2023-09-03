import os from 'os';
import { basename, join as joinPaths } from 'path';
import { readFile } from 'fs/promises';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import { VersionConfig, VERSIONS } from './versions';
import {
    downloadBoxInstaller,
    downloadExeInstaller,
    gatherInputs,
    gatherSummaryFiles,
    getOsVersion,
    waitForDatabase,
} from './utils';

/**
 * Attempt to load the installer from the tool-cache, otherwise, fetch it.
 *
 * @param {VersionConfig} config
 * @returns {string} The path to the installer
 */
function findOrDownloadTool(config: VersionConfig): Promise<string> {
    const toolPath = tc.find('sqlserver', config.version);
    if (toolPath) {
        core.info(`Found in cache @ ${toolPath}`);
        return Promise.resolve(joinPaths(toolPath, 'setup.exe'));
    } else if (config.boxUrl) {
        return downloadBoxInstaller(config);
    }
    return downloadExeInstaller(config);
}

export default async function install() {
    const { version, password, collation, installArgs, wait, skipOsCheck } = gatherInputs();
    // we only support windows for now. But allow crazy people to skip this check if they like...
    if (!skipOsCheck && os.platform() !== 'win32') {
        throw new Error(`setup-sqlserver only supports Windows runners, got: ${os.platform()}`);
    }
    const osVersion = await getOsVersion();
    if (!VERSIONS.has(version)) {
        throw new Error(`Unsupported SQL Version, supported versions are ${Array.from(VERSIONS.keys()).join(', ')}, got: ${version}`);
    }
    const config = VERSIONS.get(version)!;
    // try to fail fast if the OS is not supported
    if (config.osSupport) {
        const { min, max } = config.osSupport;
        // allow checks to be skipped
        if (skipOsCheck) {
            core.info('Skipping OS checks');
        } else if (!osVersion) {
            core.notice('Unable to determine OS version, continuing tentatively');
        } else if ((min && min > osVersion) || (max && max < osVersion)) {
            // construct a helpful error
            let message = 'Please use ';
            if (min) {
                message += `windows-${min}`;
            }
            if (max) {
                if (min) {
                    message += ' to ';
                }
                message += `windows-${max}`;
            }
            message += '.';
            throw new Error(`Runner version windows-${osVersion} is not supported for SQL Server ${version}. ${message}`);
        }
    }
    // Initial checks complete - fetch the installer
    const toolPath = await core.group(`Fetching install media for ${version}`, () => findOrDownloadTool(config));
    const instanceName = 'MSSQLSERVER';
    try {
        // @todo - make sure that the arguments are unique / don't conflict
        await core.group('Installing SQL Server', () => exec.exec(`"${toolPath}"`, [
            '/q',
            '/ACTION=Install',
            '/FEATURES=SQLEngine', //,FullText,RS,Tools
            `/INSTANCENAME=${instanceName}`,
            // '/SQLSVCACCOUNT="NT SERVICE\\MSSQLSERVER"',
            '/SQLSYSADMINACCOUNTS="BUILTIN\\ADMINISTRATORS"',
            '/TCPENABLED=1',
            '/NPENABLED=0',
            `/SQLCOLLATION="${collation}"`,
            '/SECURITYMODE=SQL',
            `/SAPWD="${password}"`,
            '/IACCEPTSQLSERVERLICENSETERMS',
            ...(config.installArgs ?? []),
            ...installArgs,
        ], {
            windowsVerbatimArguments: true,
        }));
        // set outputs
        core.setOutput('sa-password', password);
        core.setOutput('instance-name', instanceName);
        if (wait) {
            core.startGroup('Waiting for database');
            let res = await waitForDatabase(password);
            let count = 0;
            while (res !== 0 && count < 5) {
                const waitTime = Math.pow(2, count);
                core.debug(`Database not ready, waiting ${waitTime} second${waitTime === 1 ? '' : 's'}`);
                await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
                count++;
                core.debug(`Checking database, attempt ${count}`);
                res = await waitForDatabase(password);
                if (res === 0) {
                    break;
                }
            }
            if (res === 0) {
                if (count) {
                    core.info(`Database ready after ${count} attempts`);
                } else {
                    core.info(`Database ready`);
                }
            } else {
                core.warning(`Database not ready after ${count} attempts, moving on`);
            }
            core.endGroup();
        }
        core.info(`SQL Server ${version} installed`);
    } finally {
        // For information purposes, output the summary.txt file
        // if there was an error, then also fetch the detail.txt file and output that too
        const files = await gatherSummaryFiles(core.isDebug());
        // read the files in parallel
        const contents: [string, Buffer][] = await Promise.all(files.map((path) => readFile(path).then((content): [string, Buffer] => {
            return [path, content];
        })));
        // output the files sequentially
        contents.forEach(([file, content]) => {
            core.startGroup(basename(file));
            core.info(content.toString());
            core.endGroup();
        });
    }
}

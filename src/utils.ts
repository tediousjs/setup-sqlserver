import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as io from '@actions/io';
import { basename, extname, dirname, join as joinPaths } from 'path';
import { VersionConfig } from './versions';
import { generateFileHash } from './crypto';
import * as glob from '@actions/glob';

/**
 * Helper function to determine the runner being used. Uses `systeminfo` to gather version.
 *
 * See: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/systeminfo
 *
 * @returns {number | null}
 */
export async function getOsVersion() {
    try {
        const systeminfo = await exec.getExecOutput('systeminfo', [], {
            silent: true,
        });
        // output the systeminfo in debug mode
        if (core.isDebug()) {
            core.startGroup('systeminfo');
            core.debug(systeminfo.stdout);
            core.endGroup();
        }
        // try to parse out the os name
        const matches = systeminfo.stdout.match(/os name:\s+(.*)/i);
        if (matches) {
            // parse the "version" (year)
            const version = matches[1].match(/([0-9]+)/);
            if (version) {
                return parseInt(version[1], 10);
            }
        }
    } catch (e) {
        // don't throw errors, so the action can be as permissive as possible
        core.warning(e as Error);
    }
    return null;
}

export interface Inputs {
    version: string;
    password: string;
    collation: string;
    installArgs: string[];
    wait: boolean;
    skipOsCheck: boolean;
    nativeClientVersion: string;
    odbcVersion: string;
}

/**
 * Gather the action's inputs.
 *
 * @returns {Inputs}
 */
export function gatherInputs(): Inputs {
    const version = core.getInput('sqlserver-version').replace(/sql-/i, '') || 'latest';
    return {
        version: version.toLowerCase() === 'latest' ? '2022' : version,
        password: core.getInput('sa-password'),
        collation: core.getInput('db-collation'),
        installArgs: core.getMultilineInput('install-arguments'),
        wait: core.getBooleanInput('wait-for-ready'),
        skipOsCheck: core.getBooleanInput('skip-os-check'),
        nativeClientVersion: core.getInput('native-client-version'),
        odbcVersion: core.getInput('odbc-version'),
    };
}

/**
 * Generic tool downloader, adds extensions to downloaded tools as they are needed
 * on windows for EXEs.
 *
 * @param {string} url
 * @param {string} [extName]
 * @returns {string} The path of the downloaded tool
 */
export function downloadTool(url: string, extName?: string) {
    core.debug(`Downloading from ${url}`);
    return tc.downloadTool(url).then((path) => {
        const ext = extName ?? extname(url);
        const downloadDir = dirname(path);
        const destination = joinPaths(downloadDir, `${basename(path, `${ext}`)}${ext}`);
        return io.mv(path, destination).then(() => {
            return destination;
        });
    });
}

/**
 * Helper function that uses sqlcmd to check if the SQL server is running.
 *
 * @param {string} password
 * @returns {number} Status code
 */
export function waitForDatabase(password: string) {
    return exec.exec('sqlcmd', [
        '-S',
        '(local)',
        '-U',
        'sa',
        '-P',
        password,
        '-Q',
        'SELECT @@VERSION',
    ], {
        ignoreReturnCode: true,
    });
}

/**
 * Download a two-step installer (identified by the `box` file that is needed)
 *
 * @param {VersionConfig} config
 * @returns {string} The path to the installer executable
 */
export async function downloadBoxInstaller(config: VersionConfig): Promise<string> {
    if (!config.boxUrl) {
        throw new Error('No boxUrl provided');
    }
    const [exePath, boxPath] = await Promise.all([
        downloadTool(config.exeUrl),
        downloadTool(config.boxUrl),
    ]);
    if (core.isDebug()) {
        const hashes = await Promise.all([
            generateFileHash(exePath),
            generateFileHash(boxPath),
        ]);
        core.debug(`Got setup file (exe) with hash SHA256=${hashes[0].toString('base64')}`);
        core.debug(`Got setup file (box) with hash SHA256=${hashes[1].toString('base64')}`);
    }
    const downloadDir = dirname(exePath);
    core.info(`Extracting installer`);
    await exec.exec(`"${exePath}"`, [
        '/qs',
        `/x:setup`,
    ], {
        cwd: downloadDir,
        windowsVerbatimArguments: true,
    });
    core.info('Adding to the cache');
    const toolPath = await tc.cacheDir(joinPaths(downloadDir, 'setup'), 'sqlserver', config.version);
    core.debug(`Cached @ ${toolPath}`);
    return joinPaths(toolPath, 'setup.exe');
}

/**
 * Downloads an EXE installer
 *
 * @param {VersionConfig} config
 * @returns {Promise<string>}
 */
export async function downloadExeInstaller(config: VersionConfig): Promise<string> {
    if (config.boxUrl) {
        throw new Error('Version requires box installer');
    }
    const exePath = await downloadTool(config.exeUrl);
    if (core.isDebug()) {
        const hash = await generateFileHash(exePath);
        core.debug(`Got setup file (exe) with hash SHA256=${hash.toString('base64')}`);
    }
    core.info('Adding to the cache');
    const toolPath = await tc.cacheFile(exePath, 'setup.exe', 'sqlserver', config.version);
    core.debug(`Cached @ ${toolPath}`);
    return joinPaths(toolPath, 'setup.exe');
}



/**
 * Gather installation summary file. Used after installation to output summary data.
 * Optionally can also fetch the Detail.txt file (useful for debugging errors).
 *
 * See: https://learn.microsoft.com/en-us/sql/database-engine/install-windows/view-and-read-sql-server-setup-log-files
 *
 * @param {boolean} withDetail
 * @returns {Promise<string[]>} The file paths
 */
export async function gatherSummaryFiles(withDetail: boolean = false): Promise<string[]> {
    // The summary file is in a different location depending on the version of SQL Server being installed,
    // use glob to find it.
    const summaryFiles = await glob.create('C:/Program Files/Microsoft SQL Server/[0-9]*/Setup Bootstrap/Log/Summary.txt')
        .then((globber) => globber.glob());
    if (summaryFiles.length) {
        core.debug(`Found files: ${summaryFiles.join(', ')}`);
    } else {
        core.notice('No summary files found');
    }
    // try to find detail file, this is in a directory that contains the installation date_time
    // sort the files and then pull the last one off (as that is likely to be the most recent
    // installation attempt)
    const detailFile = withDetail ? await glob.create('C:/Program Files/Microsoft SQL Server/[0-9]*/Setup Bootstrap/Log/[0-9]*_[0-9]*/Detail.txt')
        .then((globber) => globber.glob())
        .then((files) => files.sort())
        .then((files) => {
            if (files.length) {
                core.debug(`Found detail files: ${files.join(', ')}`);
                return files.pop();
            } else {
                core.notice('No detail files found');
            }
        }) : undefined;
    return summaryFiles.concat(detailFile ? [detailFile] : []);
}

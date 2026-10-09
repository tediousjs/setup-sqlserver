import { mkdtemp, readdir } from 'node:fs/promises';
import { basename, extname, dirname, join as joinPaths } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as glob from '@actions/glob';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import { generateFileHash } from './crypto.ts';
import type { VersionConfig } from './versions.ts';

/**
 * Helper function to determine the runner being used. Uses `systeminfo` to gather version.
 *
 * See: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/systeminfo
 *
 * @returns {number | null}
 */
export async function getOsVersion() {
    try {
        const systeminfo = await core.platform.getDetails();
        // output the systeminfo in debug mode
        if (core.isDebug()) {
            core.startGroup('systeminfo');
            core.debug(Object.entries(systeminfo).map((tuple) => tuple.join(': ')).join('\n'));
            core.endGroup();
        }
        // parse the "version" (year)
        const version = systeminfo.name.match(/([0-9]+)/);
        if (version) {
            return parseInt(version[1], 10);
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
    installUpdates: boolean;
}

/**
 * Gather the action's inputs.
 *
 * @returns {Inputs}
 */
export function gatherInputs(): Inputs {
    const version = core.getInput('sqlserver-version').replace(/sql-/i, '') || 'latest';
    return {
        version: version.toLowerCase() === 'latest' ? '2025' : version,
        password: core.getInput('sa-password'),
        collation: core.getInput('db-collation'),
        installArgs: core.getMultilineInput('install-arguments'),
        wait: core.getBooleanInput('wait-for-ready'),
        skipOsCheck: core.getBooleanInput('skip-os-check'),
        nativeClientVersion: core.getInput('native-client-version'),
        odbcVersion: core.getInput('odbc-version'),
        installUpdates: core.getBooleanInput('install-updates'),
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
        '-l',
        '5',
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
    if (!config.exeUrl) {
        throw new Error('No exeUrl provided');
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
    return extractAndCacheInstaller(exePath, config.version);
}

/**
 * Extract a self-extracting SQL Server installer into its own temporary
 * directory and add the extracted files to the tool cache.
 *
 * @param {string} exePath
 * @param {string} version
 * @returns {Promise<string>} The path to the cached setup.exe
 */
async function extractAndCacheInstaller(exePath: string, version: string): Promise<string> {
    const workDir = dirname(exePath);
    const setupDir = await mkdtemp(joinPaths(workDir, 'sqlserver-setup-'));
    core.info('Extracting installer');
    await exec.exec(`"${exePath}"`, [
        '/qs',
        `/x:"${setupDir}"`,
    ], {
        cwd: workDir,
        windowsVerbatimArguments: true,
    });
    core.info('Adding to the cache');
    const toolPath = await tc.cacheDir(setupDir, 'sqlserver', version);
    core.debug(`Cached @ ${toolPath}`);
    return joinPaths(toolPath, 'setup.exe');
}

/**
 * Downloads install media using the SSEI bootstrapper. The bootstrapper is
 * downloaded and then executed with /Action=Download to fetch the CAB media,
 * which is then extracted in the same way as the box installer.
 *
 * @param {VersionConfig} config
 * @returns {Promise<string>} The path to the installer executable
 */
export async function downloadSseiInstaller(config: VersionConfig): Promise<string> {
    if (!config.sseiUrl) {
        throw new Error('No sseiUrl provided');
    }
    // download the SSEI bootstrapper
    const sseiPath = await downloadTool(config.sseiUrl);
    if (core.isDebug()) {
        const hash = await generateFileHash(sseiPath);
        core.debug(`Got SSEI bootstrapper with hash SHA256=${hash.toString('base64')}`);
    }
    // use the bootstrapper to download the actual media
    const mediaDir = await mkdtemp(joinPaths(dirname(sseiPath), 'sqlserver-media-'));
    core.info('Downloading install media via SSEI bootstrapper');
    await exec.exec(`"${sseiPath}"`, [
        '/Action=Download',
        `/MediaPath="${mediaDir}"`,
        '/MediaType=CAB',
        '/Quiet',
        '/Language=en-US',
    ], {
        windowsVerbatimArguments: true,
    });
    const files = await readdir(mediaDir);
    const exeFiles = files.filter((file) => file.toLowerCase().endsWith('.exe'));
    if (exeFiles.length === 0) {
        throw new Error('SSEI bootstrapper did not produce an installer exe');
    }
    if (exeFiles.length > 1) {
        throw new Error(`SSEI bootstrapper produced multiple installer exes: ${exeFiles.join(', ')}`);
    }
    return extractAndCacheInstaller(joinPaths(mediaDir, exeFiles[0]), config.version);
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
    if (!config.exeUrl) {
        throw new Error('No exeUrl provided');
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

function isUpdateDownloadUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https:\/\/download\.microsoft\.com\/[^\s"'<>?#]+\.exe$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractUpdateDownloadUrl(body: string): string {
    const links = new Set<string>();
    const metadataProblems: string[] = [];
    for (const [, script] of body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
        const assignment = script.match(/^\s*window\.__DLCDetails__\s*=\s*([\s\S]*?)\s*;?\s*$/);
        if (!assignment) {
            continue;
        }
        try {
            const details: unknown = JSON.parse(assignment[1]);
            if (!isRecord(details) || !isRecord(details.dlcDetailsView)) {
                throw new Error('Invalid cumulative update metadata in Microsoft download page');
            }
            const { downloadFile: files, error: pageError } = details.dlcDetailsView;
            if (typeof pageError === 'string' && pageError.trim()) {
                const reason = `Microsoft download page error: ${pageError}`;
                metadataProblems.push(reason);
                core.debug(reason);
            }
            if (!Array.isArray(files)) {
                throw new Error('Invalid cumulative update file list in Microsoft download page');
            }
            const urls = files.filter(isRecord).map((file) => file.url);
            const installerUrls = urls.filter(isUpdateDownloadUrl);
            if (!installerUrls.length) {
                const listed = [...new Set(urls.filter((url): url is string => typeof url === 'string' && url.length > 0))];
                throw new Error(`File list has no HTTPS download.microsoft.com .exe installer${listed.length ? ` (found: ${listed.join(', ')})` : ''}`);
            }
            for (const url of installerUrls) {
                links.add(url);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            metadataProblems.push(reason);
            core.debug(`Unable to use cumulative update metadata: ${reason}`);
        }
    }
    if (!links.size) {
        for (const [, link] of body.matchAll(/<a\b[^>]*?\s+href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
            if (isUpdateDownloadUrl(link)) {
                links.add(link);
            }
        }
    }
    if (links.size !== 1) {
        core.debug(body);
        const reason = links.size
            ? 'Multiple cumulative update installers found in Microsoft download page'
            : 'No HTTPS download.microsoft.com .exe cumulative update installer found in Microsoft download page';
        throw new Error(`${reason}${metadataProblems.length ? `. Metadata problems: ${metadataProblems.join('; ')}` : ''}`);
    }
    const [link] = links;
    return link;
}

/**
 * Summarise a fetch failure's cause, leaving out the error code when the
 * message already contains it (e.g. "getaddrinfo ENOTFOUND host").
 *
 * @param {unknown} cause
 * @returns {string}
 */
function describeCause(cause: unknown): string {
    if (typeof cause === 'string') {
        return cause;
    }
    if (!isRecord(cause)) {
        return '';
    }
    const message = typeof cause.message === 'string' ? cause.message : '';
    const code = typeof cause.code === 'string' && !message.includes(cause.code) ? cause.code : '';
    return [message, code].filter(Boolean).join(' / ');
}

async function fetchUpdatePage(url: string): Promise<string> {
    const attempts = 3;
    for (let attempt = 1; ; attempt++) {
        let retryable = false;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (!res.ok) {
                retryable = true;
                throw new Error(`HTTP ${res.status}`);
            }
            return await res.text();
        } catch (error) {
            retryable ||= error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
            let reason = error instanceof Error ? error.message : String(error);
            const causeDetails = error instanceof Error ? describeCause(error.cause) : '';
            if (causeDetails) {
                reason += ` (${causeDetails})`;
            }
            if (!retryable || attempt === attempts) {
                throw new Error(`Unable to fetch cumulative update page ${url} after ${attempt} attempt(s): ${reason}`, { cause: error });
            }
            core.info(`Cumulative update page fetch failed (${reason}); retrying (${attempt + 1}/${attempts})`);
            await delay(5000 * attempt);
        }
    }
}

/**
 * Downloads cumulative updates for supported versions. Throws with the failure
 * reason if a configured update cannot be fetched or resolved.
 *
 * @param {VersionConfig} config
 * @returns {Promise<string>}
 */
export async function downloadUpdateInstaller(config: VersionConfig): Promise<string> {
    if (!config.updateUrl) {
        throw new Error('No update url provided');
    }
    const downloadLink = config.updateUrl.endsWith('.exe')
        ? config.updateUrl
        : extractUpdateDownloadUrl(await fetchUpdatePage(config.updateUrl));
    core.info(`Downloading cumulative update from ${downloadLink}`);
    const updatePath = await downloadTool(downloadLink);
    if (core.isDebug()) {
        const hash = await generateFileHash(updatePath);
        core.debug(`Got update file with hash SHA256=${hash.toString('base64')}`);
    }
    core.info('Adding to the cache');
    const toolPath = await tc.cacheFile(updatePath, 'sqlupdate.exe', 'sqlupdate', config.version);
    core.debug(`Cached @ ${toolPath}`);
    return joinPaths(toolPath, 'sqlupdate.exe');
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

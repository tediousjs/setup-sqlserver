import { mkdtemp, readdir } from 'node:fs/promises';
import { basename, extname, dirname, join as joinPaths, win32 } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as glob from '@actions/glob';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import { generateFileHash } from './crypto.ts';
import { cacheToolDir, cacheToolFile } from './tool-cache.ts';
import type { VersionConfig } from './versions.ts';
import { quoteWindowsArgument } from './windows-args.ts';

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
 * Register the SA password as a secret, so that it shows as *** in the logs of this and later steps. The setup and
 * sqlcmd command lines that the action logs can show the password in its escaped form, so mask that form too.
 *
 * @param {string} password
 */
function maskPassword(password: string) {
    if (!password) {
        return;
    }
    core.setSecret(password);
    const escaped = quoteWindowsArgument(password).slice(1, -1);
    if (escaped !== password) {
        core.setSecret(escaped);
    }
}

/**
 * SQL Server setup passes its arguments on to the installer that it starts, and a value with a double quote doesn't
 * survive that, even when it is escaped. Stop before anything is downloaded, instead of failing later inside setup.
 * The error names the input, but never the value, which can be a password.
 *
 * @param {string} input The input name
 * @param {string} value
 */
function assertNoDoubleQuote(input: string, value: string) {
    if (value.includes('"')) {
        throw new Error(`The ${input} input must not contain a double quote ("), because SQL Server setup can't pass it on to the installer that it starts`);
    }
}

/**
 * Gather the action's inputs.
 *
 * @returns {Inputs}
 */
export function gatherInputs(): Inputs {
    const version = core.getInput('sqlserver-version').replace(/sql-/i, '') || 'latest';
    const password = core.getInput('sa-password');
    maskPassword(password);
    const collation = core.getInput('db-collation');
    assertNoDoubleQuote('sa-password', password);
    assertNoDoubleQuote('db-collation', collation);
    return {
        version: version.toLowerCase() === 'latest' ? '2025' : version,
        password,
        collation,
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
 * The outcome of the readiness check. It is `unavailable` when sqlcmd can't run, for example because it isn't on
 * the PATH.
 */
export type DatabaseReadiness =
    | { status: 'ready' | 'not-ready', attempts: number }
    | { status: 'unavailable', reason: string };

/**
 * The number of times that the readiness check tries to log in. If you change it, also change the
 * `wait-for-ready` description in `action.yml`.
 */
const READINESS_ATTEMPTS = 6;

/**
 * Try up to READINESS_ATTEMPTS times to log in to the SQL Server instance. Before each new attempt, wait twice
 * as long as before, starting at 1 second. If sqlcmd can't run, stop and return `unavailable` instead of
 * rejecting.
 *
 * @param {string} password
 * @returns {Promise<DatabaseReadiness>}
 */
export async function waitForDatabase(password: string): Promise<DatabaseReadiness> {
    try {
        let attempts = 1;
        let res = await queryDatabase(password);
        while (res !== 0 && attempts < READINESS_ATTEMPTS) {
            const waitTime = 2 ** (attempts - 1);
            core.debug(`Database not ready, waiting ${waitTime} second${waitTime === 1 ? '' : 's'}`);
            await delay(waitTime * 1000);
            attempts++;
            core.debug(`Checking database, attempt ${attempts} of ${READINESS_ATTEMPTS}`);
            res = await queryDatabase(password);
        }
        if (res !== 0) {
            return { status: 'not-ready', attempts };
        }
        core.info(attempts === 1 ? 'Database ready' : `Database ready after ${attempts} attempts`);
        return { status: 'ready', attempts };
    } catch (error) {
        // exec rejects when it can't find sqlcmd on the PATH, or when Node reports a spawn error event, for
        // example EACCES
        return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Use sqlcmd to check once if the SQL Server instance accepts logins.
 *
 * @param {string} password
 * @returns {Promise<number>} The sqlcmd exit code
 */
function queryDatabase(password: string) {
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
    // don't cache an extraction that produced no setup.exe
    const extracted = await readdir(setupDir);
    if (!extracted.some((file) => file.toLowerCase() === 'setup.exe')) {
        throw new Error(`Extracting the SQL Server ${version} installer did not produce setup.exe in ${setupDir} (found: ${extracted.join(', ') || 'no files'})`);
    }
    core.info('Adding to the cache');
    const toolPath = await cacheToolDir(setupDir, 'sqlserver', version);
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
        throw new Error(`SSEI bootstrapper did not produce an installer exe in ${mediaDir} (found: ${files.join(', ') || 'no files'})`);
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
    const toolPath = await cacheToolFile(exePath, 'setup.exe', 'sqlserver', config.version);
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
    const toolPath = await cacheToolFile(updatePath, 'sqlupdate.exe', 'sqlupdate', config.version);
    core.debug(`Cached @ ${toolPath}`);
    return joinPaths(toolPath, 'sqlupdate.exe');
}

/**
 * Escape the glob characters in a literal path, so that a glob pattern matches it exactly. On Windows, @actions/glob
 * has no escape character, so wrap each glob character in [].
 *
 * @param {string} path
 * @returns {string}
 */
function escapeGlob(path: string): string {
    return path.replace(/[[*?]/g, '[$&]');
}

/**
 * The glob pattern of the SQL Server directory in Program Files, where setup writes its logs and installs instances
 * by default. The Program Files directory can be on a drive other than C:, so use the ProgramFiles environment
 * variable.
 *
 * @returns {string}
 */
function sqlServerDirPattern(): string {
    return win32.join(escapeGlob(process.env.ProgramFiles || 'C:\\Program Files'), 'Microsoft SQL Server');
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
    const logDir = win32.join(sqlServerDirPattern(), '[0-9]*', 'Setup Bootstrap', 'Log');
    const summaryFiles = await glob.create(win32.join(logDir, 'Summary.txt'))
        .then((globber) => globber.glob());
    if (summaryFiles.length) {
        core.debug(`Found files: ${summaryFiles.join(', ')}`);
    } else {
        core.notice('No summary files found');
    }
    // Setup writes the Detail.txt of each run in a directory named after the start time of the run (YYYYMMDD_HHMMSS).
    // Each SQL Server version has its own log directory. Sort the files by the start time and use the last file, which
    // is from the most recent run. Do not sort by the full path: the version directory comes first in the path, so
    // that sort chooses an older run of a later version. If two runs have the same start time, use the full path.
    const startTime = (file: string) => win32.basename(win32.dirname(file));
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const detailFile = withDetail ? await glob.create(win32.join(logDir, '[0-9]*_[0-9]*', 'Detail.txt'))
        .then((globber) => globber.glob())
        .then((files) => files.sort((a, b) => compare(startTime(a), startTime(b)) || compare(a, b)))
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

/**
 * Gather the error logs of an instance. Used after a failed installation to output the reason the Database
 * Engine did not start, which is recorded here rather than in the setup logs.
 *
 * See: https://learn.microsoft.com/en-us/sql/tools/configuration-manager/viewing-the-sql-server-error-log
 *
 * @param {string} instanceName
 * @returns {Promise<string[]>} The file paths, oldest log first
 */
export async function gatherErrorLogs(instanceName: string): Promise<string[]> {
    // Each start of the engine moves the previous logs along to ERRORLOG.1, ERRORLOG.2, etc. Setup records where the
    // current log is in the instance's startup parameters, which accounts for custom instance or data directories.
    // Otherwise, glob the default instance directory, which includes the major version (eg: MSSQL16.MSSQLSERVER).
    const errorLogPath = await findErrorLogPath(instanceName);
    let errorLogs: string[];
    if (errorLogPath) {
        const logDirectory = win32.dirname(errorLogPath);
        const logName = win32.basename(errorLogPath);
        errorLogs = (await readdir(logDirectory))
            .filter((file) => file.startsWith(logName) && /^(\.\d+)?$/.test(file.slice(logName.length)))
            .map((file) => win32.join(logDirectory, file));
    } else {
        const instanceDir = `MSSQL[0-9]*.${escapeGlob(instanceName)}`;
        errorLogs = await glob.create(win32.join(sqlServerDirPattern(), instanceDir, 'MSSQL', 'Log', 'ERRORLOG*'))
            .then((globber) => globber.glob());
    }
    if (errorLogs.length) {
        core.debug(`Found error logs: ${errorLogs.join(', ')}`);
    } else {
        core.notice('No error logs found');
    }
    // order the logs so that the one from the most recent start of the engine comes last
    const generation = (path: string) => Number(win32.extname(path).slice(1));
    return errorLogs.sort((a, b) => generation(b) - generation(a));
}

/**
 * Find the path of an instance's current error log from the startup parameters that setup records for it.
 *
 * See: https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/database-engine-service-startup-options
 *
 * @param {string} instanceName
 * @returns {Promise<string | undefined>} The path, if the instance has been registered
 */
async function findErrorLogPath(instanceName: string): Promise<string | undefined> {
    const instanceIds = await queryRegistry('HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL');
    const instanceId = instanceIds.get(instanceName);
    if (!instanceId) {
        return undefined;
    }
    const parameters = await queryRegistry(`HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${instanceId}\\MSSQLServer\\Parameters`);
    // the parameters are stored as SQLArg0, SQLArg1, etc. and the error log is the one starting -e
    for (const parameter of parameters.values()) {
        const [, errorLogPath] = parameter.match(/^-e\s*(.+)$/) ?? [];
        if (errorLogPath) {
            return errorLogPath;
        }
    }
}

/**
 * Read the values of a registry key.
 *
 * @param {string} key
 * @returns {Promise<Map<string, string>>} The value names and their data, empty if the key doesn't exist
 */
async function queryRegistry(key: string): Promise<Map<string, string>> {
    const { exitCode, stdout } = await exec.getExecOutput('reg', ['query', key], {
        ignoreReturnCode: true,
        silent: true,
    });
    const values = new Map<string, string>();
    if (exitCode === 0) {
        // values are listed beneath the key as "<name>    <type>    <data>"
        for (const line of stdout.split(/\r?\n/)) {
            const [, name, data] = line.match(/^\s+(\S+)\s+REG_\w+\s+(.*?)\s*$/) ?? [];
            if (name) {
                values.set(name, data);
            }
        }
    }
    return values;
}

/**
 * The largest physical sector size, in bytes, of a volume that SQL Server can use.
 *
 * See: https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/database-file-operations/troubleshoot-os-4kb-disk-sector-size
 */
const MAX_SECTOR_SIZE = 4096;

/**
 * Get the drive of a Windows path, eg: "C:" for "C:\Program Files".
 *
 * @param {string | undefined} path
 * @returns {string | undefined} The drive in upper case, undefined if the path doesn't start with one
 */
function driveOf(path: string | undefined): string | undefined {
    return path?.match(/^([a-z]:)\\/i)?.[1].toUpperCase();
}

/**
 * Read the physical sector size of a volume: the larger of the two physical values that fsutil reports, which is
 * the value that Microsoft says to compare with 4 KB.
 *
 * @param {string} drive eg: "C:"
 * @returns {Promise<number | undefined>} The size in bytes, undefined if it can't be read
 */
async function getPhysicalSectorSize(drive: string): Promise<number | undefined> {
    try {
        const { exitCode, stdout } = await exec.getExecOutput('fsutil', ['fsinfo', 'sectorinfo', drive], {
            ignoreReturnCode: true,
            silent: true,
        });
        const sizes = [...stdout.matchAll(/^\s*PhysicalBytesPerSectorFor(?:Atomicity|Performance)\s*:\s*(\d+)/gm)]
            .map(([, size]) => Number(size));
        if (sizes.length) {
            core.debug(`Physical sector size of ${drive} is ${Math.max(...sizes)} bytes`);
            return Math.max(...sizes);
        }
        core.debug(`Unable to read the sector size of ${drive}: fsutil exited with code ${exitCode} and printed no physical sector sizes`);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        core.debug(`Unable to read the sector size of ${drive}: ${reason}`);
    }
    return undefined;
}

/**
 * Find setup arguments that move the instance off a volume that SQL Server can't use.
 *
 * SQL Server can't start from a volume whose physical sector size is over 4 KB, and the OS disk of some
 * GitHub-hosted runners reports 8 KB. Microsoft's fix is a registry value that needs a reboot, so instead install
 * the instance on the volume of the runner's temporary directory. Both directories must move: the data directory
 * holds the system databases, and the instance directory holds the resource database.
 *
 * @param {string[]} installArgs The setup arguments from the install-arguments input
 * @returns {Promise<string[]>} The setup arguments to add, empty if none are needed
 */
export async function findInstanceDirArgs(installArgs: string[]): Promise<string[]> {
    // the user has chosen where the instance goes
    if (installArgs.some((arg) => /^[/-](INSTANCEDIR|INSTALLSQLDATADIR)=/i.test(arg))) {
        return [];
    }
    // setup installs the instance in the Program Files directory by default
    const defaultDrive = driveOf(process.env.ProgramFiles) ?? 'C:';
    const defaultSize = await getPhysicalSectorSize(defaultDrive);
    if (!defaultSize || defaultSize <= MAX_SECTOR_SIZE) {
        return [];
    }
    const problem = `${defaultDrive} reports a physical sector size of ${defaultSize} bytes, which SQL Server can't use.`;
    const tempDrive = driveOf(process.env.RUNNER_TEMP);
    const tempSize = tempDrive && tempDrive !== defaultDrive ? await getPhysicalSectorSize(tempDrive) : undefined;
    if (!tempDrive || !tempSize || tempSize > MAX_SECTOR_SIZE) {
        core.warning(`${problem} No other volume with a supported sector size was found, so setup is likely to fail. See https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/database-file-operations/troubleshoot-os-4kb-disk-sector-size`);
        return [];
    }
    const directory = `${tempDrive}\\Microsoft SQL Server`;
    core.warning(`${problem} Installing the instance in ${directory} instead. To choose the directory yourself, set /INSTANCEDIR and /INSTALLSQLDATADIR in install-arguments.`);
    return [`/INSTANCEDIR="${directory}"`, `/INSTALLSQLDATADIR="${directory}"`];
}

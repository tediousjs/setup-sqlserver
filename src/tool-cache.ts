import * as tc from '@actions/tool-cache';

/**
 * Map a version identifier used by this action (e.g. `'2022'` or `'18'`) to the
 * explicit semver version it is stored under in the tool cache by padding it to
 * three parts (e.g. `'2022.0.0'`).
 *
 * `@actions/tool-cache` only performs an exact lookup in `find()` for explicit
 * semver versions. Anything else is treated as a range and matched against
 * cache directories that are named with explicit semver versions, so a tool
 * cached as `'2022'` would never be found again.
 *
 * @param {string} version
 * @returns {string}
 */
export function toCacheVersion(version: string): string {
    const parts = version.split('.');
    while (parts.length < 3) {
        parts.push('0');
    }
    return parts.join('.');
}

/**
 * Find a tool previously added to the tool cache with `cacheToolDir()` or
 * `cacheToolFile()`.
 *
 * @param {string} tool
 * @param {string} version
 * @param {string} [arch]
 * @returns {string} The path to the cached tool directory, or an empty string if not found
 */
export function findCachedTool(tool: string, version: string, arch?: string): string {
    return tc.find(tool, toCacheVersion(version), arch);
}

/**
 * Add a directory to the tool cache.
 *
 * @param {string} sourceDir
 * @param {string} tool
 * @param {string} version
 * @param {string} [arch]
 * @returns {Promise<string>} The path to the cached tool directory
 */
export function cacheToolDir(sourceDir: string, tool: string, version: string, arch?: string): Promise<string> {
    return tc.cacheDir(sourceDir, tool, toCacheVersion(version), arch);
}

/**
 * Add a file to the tool cache as `targetFile`.
 *
 * @param {string} sourceFile
 * @param {string} targetFile
 * @param {string} tool
 * @param {string} version
 * @param {string} [arch]
 * @returns {Promise<string>} The path to the cached tool directory
 */
export function cacheToolFile(sourceFile: string, targetFile: string, tool: string, version: string, arch?: string): Promise<string> {
    return tc.cacheFile(sourceFile, targetFile, tool, toCacheVersion(version), arch);
}

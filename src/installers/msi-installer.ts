import { join as joinPaths } from 'node:path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { cacheToolFile, findCachedTool } from '../tool-cache.ts';
import { Installer, type InstallerConfig } from './installer.ts';

export interface Urls {
    x64?: string;
    x86?: string;
}

export interface MsiInstallerConfig extends InstallerConfig {
    urls: Urls;
    appGuid?: string;
    extraArgs?: string[];
    silent?: boolean;
}

export class MsiInstaller extends Installer {
    private readonly urls: Urls;
    private readonly guid: string | undefined;
    private readonly silent: boolean;
    private readonly extraArgs: string[];
    constructor(config: MsiInstallerConfig) {
        super(config);
        this.urls = { ...config.urls };
        this.guid = config.appGuid;
        this.silent = config.silent ?? true;
        this.extraArgs = config.extraArgs ?? [];
    }

    private get installUrl(): string {
        const arch = this.getArch();
        if (this.urls[arch]) {
            return this.urls[arch];
        }
        return Object.values(this.urls).find((val) => val && typeof val === 'string');
    }

    public async install() {
        const arch = this.getArch();
        let path = findCachedTool(this.name, this.version, arch);
        if (path) {
            core.info(`Found ${this.name} installer in cache @ ${path}`);
        } else {
            core.info(`Download ${this.name} installer from ${this.installUrl}`);
            path = await this.downloadInstaller(this.installUrl, '.msi').then((tmp) => {
                return cacheToolFile(tmp, `${this.name}.msi`, this.name, this.version, arch);
            });
            core.info(`Downloaded ${this.name} installer to cache @ ${path}`);
        }
        path = joinPaths(path, `${this.name}.msi`);
        core.info('Running installer');
        const args: string[] = [
            '/i',
            `"${path}"`,
        ];
        if (this.guid) {
            args.push(`APPGUID={${this.guid}}`);
        }
        if (this.extraArgs.length) {
            args.push(...this.extraArgs);
        }
        if (this.silent) {
            args.unshift('/passive');
        }
        await exec.exec('msiexec', args, {
            windowsVerbatimArguments: true,
        });
        core.info('Install complete');
    }
}

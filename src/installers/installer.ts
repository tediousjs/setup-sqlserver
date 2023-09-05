import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { basename, dirname, extname, join as joinPaths } from 'path';
import * as io from '@actions/io';

export interface InstallerConfig {
    name: string;
    version: string;
}

export abstract class Installer {
    public readonly name: string;
    public readonly version: string;

    constructor(config: InstallerConfig) {
        this.name = config.name;
        this.version = config.version;
    }

    protected getArch(): string {
        return process.arch === 'x32' ? 'x86' : 'x64';
    }

    protected downloadInstaller(url: string, extName?: string) {
        core.debug(`Downloading from ${url}`);
        return tc.downloadTool(url).then((path) => {
            const ext = extName ?? extname(url);
            const downloadDir = dirname(path);
            const destination = joinPaths(downloadDir, `${basename(path, `${ext}`)}${ext}`);
            return io.mv(path, destination).then(() => {
                core.debug(`Downloaded to ${destination}`);
                return destination;
            });
        });
    }

    abstract install(): Promise<void>;
}

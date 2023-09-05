import { MsiInstaller, Urls } from './installers';

// https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server?view=sql-server-ver16
const VERSIONS = new Map<string, Urls>([
    ['18', {
        x64: 'https://go.microsoft.com/fwlink/?linkid=2242886',
        x86: 'https://go.microsoft.com/fwlink/?linkid=2242980',
    }],
    ['17', {
        x64: 'https://go.microsoft.com/fwlink/?linkid=2239168',
        x86: 'https://go.microsoft.com/fwlink/?linkid=2238791',
    }],
]);

export default async function installOdbc(version: string) {
    if (!VERSIONS.has(version)) {
        throw new TypeError(`Invalid ODBC version supplied ${version}. Must be one of ${Array.from(VERSIONS.keys()).join(', ')}.`);
    }
    const installer = new MsiInstaller({
        name: 'msodbcsql',
        urls: VERSIONS.get(version)!,
        version,
        extraArgs: [
            'IACCEPTMSODBCSQLLICENSETERMS=YES',
        ],
    });
    return installer.install();
}

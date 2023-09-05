import { MsiInstaller, Urls } from './installers';

const VERSIONS = new Map<string, Urls>([
    ['11', {
        x64: 'https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x64/sqlncli.msi',
        x86: 'https://download.microsoft.com/download/B/E/D/BED73AAC-3C8A-43F5-AF4F-EB4FEA6C8F3A/ENU/x86/sqlncli.msi',
    }],
]);
export default async function installNativeClient(version: string) {
    if (!VERSIONS.has(version)) {
        throw new TypeError(`Invalid native client version supplied ${version}. Must be one of ${Array.from(VERSIONS.keys()).join(', ')}.`);
    }
    // see https://learn.microsoft.com/en-us/previous-versions/sql/sql-server-2012/ms131321(v=sql.110)
    const installer = new MsiInstaller({
        name: 'sqlncli',
        urls: VERSIONS.get(version)!,
        appGuid: '0CC618CE-F36A-415E-84B4-FB1BFF6967E1',
        version,
        extraArgs: [
            'IACCEPTSQLNCLILICENSETERMS=YES',
        ],
    });
    return installer.install();
}

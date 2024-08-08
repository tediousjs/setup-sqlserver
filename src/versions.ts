interface OsSupport {
    min?: number;
    max?: number;
}

interface Config {
    version: string;
    osSupport?: OsSupport;
    installArgs?: string[];
}

export interface VersionConfig extends Config {
    exeUrl: string;
    boxUrl?: string;
    updateUrl?: string;
}

export const VERSIONS = new Map<string, VersionConfig>(
    [
        ['2022', {
            version: '2022',
            exeUrl: 'https://download.microsoft.com/download/3/8/d/38de7036-2433-4207-8eae-06e247e17b25/SQLServer2022-DEV-x64-ENU.exe',
            boxUrl: 'https://download.microsoft.com/download/3/8/d/38de7036-2433-4207-8eae-06e247e17b25/SQLServer2022-DEV-x64-ENU.box',
            updateUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=105013',
        }],
        ['2019', {
            version: '2019',
            exeUrl: 'https://download.microsoft.com/download/8/4/c/84c6c430-e0f5-476d-bf43-eaaa222a72e0/SQLServer2019-DEV-x64-ENU.exe',
            boxUrl: 'https://download.microsoft.com/download/8/4/c/84c6c430-e0f5-476d-bf43-eaaa222a72e0/SQLServer2019-DEV-x64-ENU.box',
            updateUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=100809',
        }],
        ['2017', {
            version: '2017',
            exeUrl: 'https://download.microsoft.com/download/E/F/2/EF23C21D-7860-4F05-88CE-39AA114B014B/SQLServer2017-DEV-x64-ENU.exe',
            boxUrl: 'https://download.microsoft.com/download/E/F/2/EF23C21D-7860-4F05-88CE-39AA114B014B/SQLServer2017-DEV-x64-ENU.box',
            updateUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=56128',
        }],
        ['2016', {
            version: '2016',
            exeUrl: 'https://download.microsoft.com/download/4/1/A/41AD6EDE-9794-44E3-B3D5-A1AF62CD7A6F/sql16_sp2_dlc/en-us/SQLServer2016SP2-FullSlipstream-DEV-x64-ENU.exe',
            boxUrl: 'https://download.microsoft.com/download/4/1/A/41AD6EDE-9794-44E3-B3D5-A1AF62CD7A6F/sql16_sp2_dlc/en-us/SQLServer2016SP2-FullSlipstream-DEV-x64-ENU.box',
            updateUrl: 'https://download.microsoft.com/download/a/7/7/a77b5753-8fe7-4804-bfc5-591d9a626c98/SQLServer2016SP3-KB5003279-x64-ENU.exe',
        }],
        ['2014', {
            osSupport: {
                max: 2019,
            },
            version: '2014',
            installArgs: ['/ENABLERANU=1'],
            exeUrl: 'https://download.microsoft.com/download/1/5/6/156992E6-F7C7-4E55-833D-249BD2348138/ENU/x64/SQLEXPRADV_x64_ENU.exe',
        }],
        ['2012', {
            osSupport: {
                max: 2019,
            },
            version: '2012',
            installArgs: ['/ENABLERANU=1'],
            exeUrl: 'https://download.microsoft.com/download/5/2/9/529FEF7B-2EFB-439E-A2D1-A1533227CD69/SQLEXPRADV_x64_ENU.exe',
        }],
        ['2008', {
            osSupport: {
                max: 2019,
            },
            version: '2008',
            installArgs: ['/ENABLERANU=1'],
            exeUrl: 'https://download.microsoft.com/download/0/4/B/04BE03CD-EAF3-4797-9D8D-2E08E316C998/SQLEXPRADV_x64_ENU.exe',
        }],
    ],
);

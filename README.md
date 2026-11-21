# Setup SQL Server Action

This action installs a version of SQL Server on Windows based GitHub Action Runners.

## Usage

See [action.yml](./action.yml):
<!-- start usage -->
```yaml
- uses: tediousjs/setup-sqlserver@v4
  with:
    # Skip OS checks that will stop installation attempts preemptively.
    # Default: false
    skip-os-check: false

    # SQL Server version: 2008, 2012, 2014, 2016, 2017, 2019, 2022, or 2025. "latest"
    # selects 2025. 2008, 2012 and 2014 only pass the OS check on Windows Server 2019
    # or older, which GitHub-hosted runners no longer offer; set skip-os-check to
    # attempt them on newer runners.
    # Default: latest
    sqlserver-version: 'latest'

    # Version of native client to install. Only 11 is supported.
    native-client-version: ''

    # Version of ODBC to install. Supported versions: 17, 18.
    odbc-version: ''

    # The SA user password to use. It must not contain a double quote, which SQL
    # Server setup cannot pass on.
    # Default: yourStrong(!)Password
    sa-password: 'yourStrong(!)Password'

    # The database collation to use.
    # Default: SQL_Latin1_General_CP1_CI_AS
    db-collation: 'SQL_Latin1_General_CP1_CI_AS'

    # Any custom install arguments you wish to use. These must be in the format of
    # "/ARG=VAL".
    install-arguments: ''

    # Wait for the database to respond successfully to queries before completing the
    # action. The action tries to log in up to 6 times, with waits of 1, 2, 4, 8 and
    # 16 seconds between the attempts. The check uses sqlcmd. If the database is not
    # ready, or sqlcmd cannot run, for example because it is not on the PATH, the
    # action warns and continues. If setup asked for a reboot (exit code 3010), the
    # action fails instead.
    # Default: true
    wait-for-ready: true

    # Attempt to install latest cumulative updates during the installation process
    # (not available for all versions).
    # Default: false
    install-updates: false
```
<!-- end usage -->

### Outputs

<!-- start outputs -->
| Output | Description |
| --- | --- |
| `sa-password` | The SA password, this will be the same as the input, but can be useful when relying on the default value. |
| `instance-name` | The instance name for the SQL Server. |
<!-- end outputs -->

### SA password

The default `sa-password`, `yourStrong(!)Password`, is public. The action
installs SQL Server with TCP/IP enabled (`/TCPENABLED=1`) and with SQL Server
authentication (`/SECURITYMODE=SQL`). Anyone who can connect to the runner on
the SQL Server port (1433 by default) can then log in as `sa` with the default
password.

If you use a self-hosted runner that other machines can reach, store your own
password in a secret and pass it to `sa-password`:

```yaml
- name: Install SQL Server
  uses: tediousjs/setup-sqlserver@v4
  with:
    sa-password: ${{ secrets.SQL_SA_PASSWORD }}
```

The action masks the password in its logs and in the later steps of the job.
GitHub prints the step inputs before the action starts, so a password that
doesn't come from a secret still shows in that step header. GitHub also leaves
out job outputs that contain a masked value, so read the `sa-password` output
from the step, not from a job output.

### SQL Server 2025

Set `sqlserver-version` to `'2025'` (or `'sql-2025'`) to install SQL Server
2025 Standard Developer edition. The default, `'latest'`, also selects 2025.
The action downloads the installation media using Microsoft's SSEI bootstrapper
and caches the extracted installer for subsequent runs (see [Caching](#caching)).

```yaml
- name: Install SQL Server 2025
  uses: tediousjs/setup-sqlserver@v4
  with:
    sqlserver-version: '2025'
```

### Cumulative updates

When `install-updates: true` is set for a version with a configured update URL,
the action downloads the update before starting SQL Server setup. Download-page
requests are tried up to three times on network errors, timeouts, or non-2xx
responses (including 403 and 404), with 5- and 10-second delays before retries.
If the update still can't be downloaded, the action logs a warning with the
reason and installs SQL Server without updates. Update URLs are configured for
SQL Server 2016 and later, including 2025 (and so the default, `'latest'`);
older versions skip updates.

### Caching

Downloaded SQL Server installers, cumulative updates, and ODBC and Native
Client installers are stored in the runner's tool cache and reused by later
runs on the same runner for the same version. GitHub-hosted runners start every
job with a fresh tool cache, so this mainly benefits self-hosted runners whose
tool cache persists between jobs. A cached cumulative update is reused until it is removed, so
delete the `sqlupdate` directory from the runner's tool cache to pick up a
newer update.

### Reboot requests

If SQL Server setup succeeds but asks for a reboot (exit code 3010), the action
logs a warning and carries on without rebooting. With `wait-for-ready` enabled,
the action then fails if the instance doesn't respond to queries, or if
`sqlcmd` can't run to check it. After a normal install, the action only warns
in both cases.

### Disks with large sectors

SQL Server can't start from a volume whose physical sector size is over 4 KB.
Some GitHub-hosted `windows-2022` runners have a C: drive that reports 8 KB
sectors, so SQL Server setup fails there with its default directories. Before
setup, the action reads the sector size of the Program Files volume with
`fsutil fsinfo sectorinfo`. If it is over 4 KB, and the volume of the runner's
temporary directory (D: on GitHub-hosted runners) reports 4 KB or less, the
action installs the instance in `D:\Microsoft SQL Server` and logs a warning.
The system databases, user databases, logs and backups then go to
`D:\Microsoft SQL Server\MSSQLnn.MSSQLSERVER\MSSQL\`, so use
`SERVERPROPERTY('InstanceDefaultDataPath')` rather than a fixed path to find
them. If no such volume exists, the action logs a warning and runs setup with
the default directories.

To choose the directories yourself, set `/INSTANCEDIR` and `/INSTALLSQLDATADIR`
in `install-arguments`. If either one is set, the action doesn't change the
directories. Both must be on a volume with sectors of 4 KB or less.

### Basic usage

```yml
- name: Install SQL Server
  uses: tediousjs/setup-sqlserver@v4
  with:
    sqlserver-version: sql-latest
```

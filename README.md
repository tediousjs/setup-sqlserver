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
    # selects 2025.
    # Default: latest
    sqlserver-version: 'latest'

    # Version of native client to install. Only 11 is supported.
    native-client-version: ''

    # Version of ODBC to install. Supported versions: 17, 18.
    odbc-version: ''

    # The SA user password to use.
    # Default: yourStrong(!)Password
    sa-password: 'yourStrong(!)Password'

    # The database collation to use.
    # Default: SQL_Latin1_General_CP1_CI_AS
    db-collation: 'SQL_Latin1_General_CP1_CI_AS'

    # Any custom install arguments you wish to use. These must be in the format of
    # "/ARG=VAL".
    install-arguments: ''

    # Wait for the database to respond successfully to queries before completing the
    # action. A maximum of 10 attempts is made.
    # Default: true
    wait-for-ready: true

    # Attempt to install latest cumulative updates during the installation process
    # (not available for all versions).
    # Default: false
    install-updates: false
```
<!-- end usage -->

### SQL Server 2025

Set `sqlserver-version` to `'2025'` (or `'sql-2025'`) to install SQL Server
2025 Standard Developer edition. The default, `'latest'`, also selects 2025.
The action downloads the installation media using Microsoft's SSEI bootstrapper
and attempts to cache the extracted installer for subsequent runs.

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

### Reboot requests

If SQL Server setup succeeds but asks for a reboot (exit code 3010), the action
logs a warning and carries on without rebooting. The wait-for-ready check (when
`wait-for-ready` is enabled) then confirms the instance is accepting queries.

### Basic usage

```yml
- name: Install SQL Server
  uses: ./
  with:
    sqlserver-version: sql-latest
```

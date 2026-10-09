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

    # Version to use. Examples: 2008, 2012, 2014, etc. "latest" can also be used.
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

### Cumulative updates

When `install-updates: true` is set for a version with a configured update URL,
the action downloads the update before starting SQL Server setup. Download-page
requests are tried up to three times on network errors, timeouts, or non-2xx
responses (including 403 and 404), with 5- and 10-second delays before retries.
If the update still can't be downloaded, the action logs a warning with the
reason and installs SQL Server without updates. Versions without a configured
update URL skip updates.

### Basic usage

```yml
- name: Install SQL Server
  uses: ./
  with:
    sqlserver-version: sql-latest
```

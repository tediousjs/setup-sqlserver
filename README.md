# Setup SQL Server Action

This action installs a version of SQL Server on Windows based GitHub Action Runners.

## Usage

See [action.yml](./action.yml):
<!-- start usage -->
```yaml
- uses: tediousjs/setup-sqlserver@v1
  with:
    # Skip OS checks that will stop installation attempts preemptively.
    # Default: false
    skip-os-check: ''

    # Version to use. Examples: 2008, 2012, 2014, etc. "latest" can also be used.
    # Default: latest
    sqlserver-version: ''

    # The SA user password to use.
    # Default: yourStrong(!)Password
    sa-password: ''

    # The database collation to use.
    # Default: SQL_Latin1_General_CP1_CI_AS
    db-collation: ''

    # Any custom install arguments you wish to use. These must be in the format of
    # "/ARG=VAL".
    install-arguments: ''

    # Wait for the database to respond successfully to queries before completing the
    # action. A maximum of 10 attempts is made.
    # Default: true
    wait-for-ready: ''
```
<!-- end usage -->

### Basic usage

```yml
- name: Install SQL Server
  uses: ./
  with:
    sqlserver-version: sql-latest
```

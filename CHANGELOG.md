# Changelog

## [3.0.0](https://github.com/tediousjs/setup-sqlserver/compare/v2.2.0...v3.0.0) (2025-09-30)

### ⚠ BREAKING CHANGES

* Upgrade the action runtime to node24.

### Features

* update action to use node24 ([118c752](https://github.com/tediousjs/setup-sqlserver/commit/118c7523a928f7b82764cb7d9bf52af91d6d8437))

### Bug Fixes

* use `node:` prefixed imports ([28f08b4](https://github.com/tediousjs/setup-sqlserver/commit/28f08b4a3d8fd86bd98713fcc7fcfa3e90c760c7))

## [2.2.0](https://github.com/tediousjs/setup-sqlserver/compare/v2.1.1...v2.2.0) (2024-12-04)

### Features

* use github core platform helper instead of node:os ([c760fe0](https://github.com/tediousjs/setup-sqlserver/commit/c760fe037f85d2d6373c1570af984f14197d88bd))

## [2.1.1](https://github.com/tediousjs/setup-sqlserver/compare/v2.1.0...v2.1.1) (2024-09-16)

### Bug Fixes

* improve logging around failed cumulative updates ([4657282](https://github.com/tediousjs/setup-sqlserver/commit/4657282e03d8bd126d6086f161c6b0c755863874))

## [2.1.0](https://github.com/tediousjs/setup-sqlserver/compare/v2.0.0...v2.1.0) (2024-08-09)

### Features

* add cumulative update installation for supported versions ([b2c3216](https://github.com/tediousjs/setup-sqlserver/commit/b2c3216f680d22ac0b4ed16ad0bfc8490c242f10))

## [2.0.0](https://github.com/tediousjs/setup-sqlserver/compare/v1.3.0...v2.0.0) (2024-06-18)

### ⚠ BREAKING CHANGES

* The runtime is now upgraded to Node20 from Node16
* upgrade runtime to node20

### Features

* upgrade node runtime to Node20 ([1b7e069](https://github.com/tediousjs/setup-sqlserver/commit/1b7e069a3302a0189bb331edd9d81453bde559b6))
* upgrade runtime to node20 ([5f58c26](https://github.com/tediousjs/setup-sqlserver/commit/5f58c26a35ad10819b50221626de208baed965bd))

# [1.3.0](https://github.com/tediousjs/setup-sqlserver/compare/v1.2.0...v1.3.0) (2023-09-12)


### Features

* add ODBC installer ([e9706fb](https://github.com/tediousjs/setup-sqlserver/commit/e9706fba39fcf59f26264959fcbdfb11c2261393))

# [1.2.0](https://github.com/tediousjs/setup-sqlserver/compare/v1.1.0...v1.2.0) (2023-09-12)


### Features

* output details files if install fails ([f27f339](https://github.com/tediousjs/setup-sqlserver/commit/f27f33949f28ef7aae4663f101c27c8d2416ca90))

# [1.1.0](https://github.com/tediousjs/setup-sqlserver/compare/v1.0.1...v1.1.0) (2023-09-04)


### Features

* add SQL Native Client 11.0 installer ([dd970c4](https://github.com/tediousjs/setup-sqlserver/commit/dd970c461fc23fa874b4c5d3291de36d8d045ac4))

## [1.0.1](https://github.com/tediousjs/setup-sqlserver/compare/v1.0.0...v1.0.1) (2023-09-04)


### Bug Fixes

* dont look for summary files if install not attempted ([382ee7d](https://github.com/tediousjs/setup-sqlserver/commit/382ee7d928e8a9fa951b4dc96e243e6a086b1cea))
* make sure default version of sqlserver-version is used ([750f270](https://github.com/tediousjs/setup-sqlserver/commit/750f270d23c20a4854d983dfaa40af028264dca7))

## 1.0.0 (2023-09-03)

### Features

* initial release

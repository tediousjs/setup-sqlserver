#!/usr/bin/env bash

##
# This script is used to force publish a minimal version
# of the "major" release tag (eg: v1) which allows consumers
# of the action to use `tediousjs/setup-sqlserver@v1`
##

# Stop at the first failure, so a broken package can never replace the tree
set -euo pipefail

# Only accept a full release version (vX.Y.Z), so a prerelease never moves the major tag
if ! [[ "${1-}" =~ ^v([0-9]+)\.[0-9]+\.[0-9]+$ ]]; then
  >&2 echo "Bad version provided: ${1-}"
  exit 1
fi
MAJOR="v${BASH_REMATCH[1]}"
TARBALL="./.package/tediousjs-setup-sqlserver-${1#v}.tgz"

# Pack the NPM files if they don't exist on disk
# This would be generated normally by the release step
if [ ! -d ./.package ]; then
  mkdir ./.package
  npm pack --pack-destination ./.package
fi

# Use the tarball for this exact version, never a stale one from an earlier run
if [ ! -f "$TARBALL" ]; then
  >&2 echo "Package not found: $TARBALL"
  exit 1
fi

rm -rf ./package
tar -xf "$TARBALL"
if [ ! -f ./package/action.yml ] || [ ! -f ./package/lib/main/index.js ]; then
  >&2 echo "Package is missing action.yml or lib/main/index.js"
  exit 1
fi

# Delete all files and replace them with the packed files
git rm -rf --quiet ./
git reset --quiet HEAD .gitignore
git checkout -- .gitignore
rm -rf ./.github
cp -r ./package/* ./
rm -rf ./package

# Add all the changes and create the tag
git add .
git commit -m "chore(release): ${MAJOR}"
git tag -f -a -m "chore(release): ${MAJOR}" "${MAJOR}"
git push --force origin "${MAJOR}"

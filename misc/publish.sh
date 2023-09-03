#!/usr/bin/env bash

##
# This script is used to force publish a minimal version
# of the "major" release tag (eg: v1) which allows consumers
# of the action to use `tediousjs/setup-sqlaction@v1`
##

# Check the argument is correctly formatted version
if ! [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  >&2 echo "Bad version provided: $1"
  exit 1
fi

# Pack the NPM files if they don't exist on disk
# This would be generated normally by the release step
if [ ! -d ./.package ]; then
  mkdir ./.package
  npm pack --pack-destination ./.package
fi

tar -xf ./.package/tediousjs-setup-sqlserver-*.tgz

# Delete all files and replace them with the packed files
git rm -rf ./
git reset HEAD .gitignore
git checkout -- .gitignore
rm -rf ./.github
cp -r ./package/* ./
rm -rf ./package

# Split the version at the `.` so we can use the `v1` of a `v1.1.0`
IFS='.' read -ra PARTS <<< "$1"

# Add all the changes and create the tag
git add .
git commit -m "chore(release): ${PARTS[0]}"
git tag -f -a -m "chore(release): ${PARTS[0]}" "${PARTS[0]}"
git push --force origin "${PARTS[0]}"

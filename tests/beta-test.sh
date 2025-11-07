#!/usr/bin/env bash
set -e

echo "Running beta release..."
bun release:beta

VERSION=$(cat package.json | jq -r .version)
echo "Released version: $VERSION"

echo "Waiting for package to be available on npm..."
for i in {1..10}; do
  sleep 3
  echo "Attempt $i/10: Checking if cli-yes@$VERSION is available..."
  if npm view cli-yes@$VERSION version >/dev/null 2>&1; then
    echo "Package is now available!"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "Package not available after 30 seconds"
    exit 1
  fi
done

echo "Testing the published package..."
echo "Running: cli-yes --version"

# should print the correct version
bun x --no-cache --bun cli-yes@beta --version

# should run claude command with -h, shows claude help
bun x --no-cache --bun cli-yes@beta claude -h

# should run claude command and exit
bun x --no-cache --bun cli-yes@beta claude -- say hello world and exit


echo "Beta test completed successfully!"
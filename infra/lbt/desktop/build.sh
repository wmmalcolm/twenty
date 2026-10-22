#!/usr/bin/env bash
set -euo pipefail
cd /app/packages/twenty-shared
../../node_modules/.bin/vite build
../../node_modules/.bin/tsgo -p tsconfig.lib.json --declaration --emitDeclarationOnly --noEmit false --outDir dist --rootDir src
../../node_modules/.bin/tsc-alias -p tsconfig.lib.json --outDir dist
cd /app/packages/twenty-client-sdk
../../node_modules/.bin/vite build
../../node_modules/.bin/vite build -c vite.metadata.config.ts
cd /app/packages/twenty-emails
../../node_modules/.bin/vite build
cd /app/packages/twenty-server
../../node_modules/.bin/nest build --path ./tsconfig.build.json
mkdir -p dist/assets/twenty-client-sdk
cp ../twenty-client-sdk/package.json dist/assets/twenty-client-sdk/
cp -r ../twenty-client-sdk/dist dist/assets/twenty-client-sdk/

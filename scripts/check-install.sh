#!/usr/bin/env bash
set -euo pipefail

manager=${1:?Pass npm, pnpm, yarn, bun or deno}
archive=$(realpath "${2:?Pass the path to the packed tarball}")
source_dir=$(cd "$(dirname "$0")" && pwd)
consumer_dir=$(mktemp -d)
trap 'rm -rf "$consumer_dir"' EXIT
cp "$source_dir/check-consumer.mjs" "$consumer_dir/"
# Yarn Classic caches local archives by path, including between builds of the same version.
cp "$archive" "$consumer_dir/release.tgz"
archive="$consumer_dir/release.tgz"
cd "$consumer_dir"
echo '{"name":"gnani-consumer-test","private":true,"type":"module"}' > package.json
yarn_cli=(yarn)
if [[ "$manager" == yarn-pnp ]]; then yarn_cli=(corepack yarn@4); fi

case "$manager" in
  npm) npm install --no-fund --no-audit "$archive" ;;
  pnpm) pnpm add "$archive" ;;
  yarn|yarn-pnp) "${yarn_cli[@]}" add "gnani@file:$archive" ;;
  bun) bun add "$archive" ;;
  deno)
    # Deno can resolve npm: imports against the exact unpacked release before it is published.
    tar -xzf "$archive"
    echo '{"nodeModulesDir":"auto","links":["./package"],"imports":{"gnani":"npm:gnani@*"}}' > deno.json
    deno install --quiet
    deno run --cached-only --allow-read --allow-env --allow-sys=hostname check-consumer.mjs
    exit
    ;;
  *) echo "Unknown package manager: $manager" >&2; exit 2 ;;
esac

case "$manager" in
  bun) runner=(bun) ;;
  yarn|yarn-pnp) runner=("${yarn_cli[@]}" node) ;;
  *) runner=(node) ;;
esac
"${runner[@]}" check-consumer.mjs
"${runner[@]}" -e 'const { Gnani } = require("gnani"); if (new Gnani().speech("timbre-v3.0").specificationVersion !== "v4") process.exit(1)'

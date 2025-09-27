#!/usr/bin/env bash
set -euo pipefail

# Enable recursive globbing (needed for Bash >=4)
shopt -s globstar 2>/dev/null || true

echo "🔍 Cleaning up workspace..."

# Delete all .nx directories recursively
echo "🧹 Removing .nx directories..."
find . -type d -name ".nx" -prune -exec rm -rf {} +

# Delete all build directories recursively
echo "🧹 Removing build directories..."
find . -type d -name "build" -prune -exec rm -rf {} +

# Delete all dist directories recursively
echo "🧹 Removing dist directories..."
find . -type d -name "dist" -prune -exec rm -rf {} +

# Delete all node_modules directories recursively
echo "🧹 Removing node_modules directories..."
find . -type d -name "node_modules" -prune -exec rm -rf {} +

# Delete package-lock.json in the root if it exists
if [[ -f "package-lock.json" ]]; then
  echo "🧾 Removing package-lock.json..."
  rm -f package-lock.json
fi

echo "✅ Cleanup completed."

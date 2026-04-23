#!/bin/sh
set -e

echo "🚀 Starting PolyCopy Bot & Server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ensure data directory exists for NeDB
mkdir -p /app/data

# Verify if build exists
if [ ! -f "/app/dist/index.js" ]; then
    echo "❌ ERROR: dist/index.js not found. Build failed or incomplete."
    exit 1
fi

# Run the bot
exec node dist/index.js

#!/bin/bash
MSG="${1:-deploy}"
cd "$(dirname "$0")"

# Cache busting: atualiza CACHE_NAME no sw.js via Node.js
VER="dmstack-$(date +%m%d%H%M)"
node -e "
const fs = require('fs');
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace(/const CACHE='[^']+'/, \"const CACHE='\" + process.argv[1] + \"'\");
fs.writeFileSync('sw.js', sw);
" "$VER"

git add -A
git commit -m "$MSG"
git push origin main
echo "no ar — $VER"

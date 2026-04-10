#!/bin/bash
MSG="${1:-deploy}"
cd "$(dirname "$0")"

# Cache busting: atualiza CACHE_NAME no sw.js via Node.js
VER="dmstack-$(date +%m%d%H%M)"
node -e "
const fs = require('fs');
const ver = process.argv[1];
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace(/const CACHE='[^']+'/, \"const CACHE='\" + ver + \"'\");
fs.writeFileSync('sw.js', sw);
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/const _DMS_VER = '[^']+'/, \"const _DMS_VER = '\" + ver + \"'\");
fs.writeFileSync('index.html', html);
" "$VER"

git add -A
git commit -m "$MSG"
git push origin main
echo "no ar — $VER"

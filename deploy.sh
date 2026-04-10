#!/bin/bash
MSG="${1:-deploy}"
cd "$(dirname "$0")"
git add -A
git commit -m "$MSG"
git push origin main
echo "no ar"

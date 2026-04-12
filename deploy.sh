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

# Fechar itens no DM Stack — extrai #shortid + todas as keywords com acentos normalizados
DMS_SHORTID=$(echo "$MSG" | grep -oE '#[0-9a-fA-F]{8}' | head -1)
DMS_KWS=$(echo "$MSG" | \
  sed 's/[áàâã]/a/g; s/[éêè]/e/g; s/[íî]/i/g; s/[óôõ]/o/g; s/[úû]/u/g; s/ç/c/g' | \
  tr '[:upper:]' '[:lower:]' | \
  grep -oE '[a-z]{4,}' | \
  grep -vE '^(cache|busting|deploy|versao|fixes|update|remove|corrige|corrigir|adiciona|adicionar|atualiza|atualizar|insere|inserir|agora|gravam|bloquear|duplicata|lancamento|lancamentos|codigo|sistema|diaria|diarias|modal|valor|campo|botao|registro|registros|dividida|melhoria|melhorias|historico|feature|features|titulo|status|dados|texto|abrir|fechar|criar|salvar|editar|deletar|listar|exibir|mostrar|usando|agente|agentes|deploy|commit|versao|antes|depois|quando|entre|sobre|todos|todas|telas|tela|lista|novo|nova|item|itens)$' | \
  tr '\n' ' ' | sed 's/[[:space:]]*$//')
DMS_ARGS="${DMS_SHORTID} ${DMS_KWS}"
DMS_ARGS="${DMS_ARGS## }"
if [ -n "$DMS_ARGS" ]; then
  bash "$HOME/dms-resolve.sh" "$DMS_ARGS" "DMSTACK"
fi

# Registrar deploy no DM Stack
source "$HOME/.dms-config" 2>/dev/null
if [ -n "$DMS_SERVICE_KEY" ]; then
  DEPLOY_JSON="{\"sistema\":\"DMSTACK\",\"versao\":\"$VER\",\"mensagem\":$(echo "$MSG" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}"
  curl -s -X POST "$DMS_URL/rest/v1/deploys" \
    -H "apikey: $DMS_SERVICE_KEY" \
    -H "Authorization: Bearer $DMS_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$DEPLOY_JSON" > /dev/null && echo "deploy registrado no DM Stack"
fi

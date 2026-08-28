#!/usr/bin/env sh
# Actualizar la app en el VPS después de un push. No toca el borde (deploy/edge)
# ni el certificado: reconstruye solo la imagen `web` y la vuelve a levantar.
#
#   sh deploy/actualizar.sh
#
# Si falla el `git pull`, es porque el VPS tiene commits locales: el VPS no es
# lugar para editar. Resolvelo en tu PC y volvé a pushear.
set -eu

cd "$(dirname "$0")/.."

if ! grep -q '^BASE_PATH=/' .env 2>/dev/null; then
  echo "AVISO: .env sin BASE_PATH=/... — la app se va a compilar para la raíz del dominio." >&2
fi

echo "==> git pull --ff-only origin main"
git pull --ff-only origin main

echo "==> rebuild + up"
docker compose -f docker-compose.yml -f docker-compose.edge.yml up --build -d

echo "==> limpiando imágenes huérfanas"
docker image prune -f >/dev/null

echo "==> estado"
docker compose -f docker-compose.yml -f docker-compose.edge.yml ps

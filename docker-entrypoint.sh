#!/bin/sh
#
# O que acontece ANTES do servidor, em toda subida do contêiner.
#
# Ele roda como root e sai como `node`: as duas coisas que precisam de root são
# o dono do volume de backups e a troca de usuário, e nenhuma das duas fica no
# caminho do processo — o `exec gosu` substitui o shell, então o Node vira o
# PID 1 e recebe o SIGTERM do redeploy em vez de um supervisor no meio.
set -e

if [ -z "${DATABASE_URL}" ]; then
  echo "[entrypoint] DATABASE_URL não está definida — cadastre-a no ambiente do serviço." >&2
  exit 1
fi

# 1. O schema.
#
#    O migrador aplica só o que falta (o drizzle guarda o aplicado em
#    `drizzle.__drizzle_migrations`), não apaga nada e não recria nada: subir
#    duas vezes é subir uma. Quem quiser separar a migração do deploy — para
#    rodá-la à mão numa janela combinada — põe MIGRAR_NA_SUBIDA=false e chama
#    `node dist/migrar.mjs` pelo console do serviço.
#
#    Ele roda ANTES do servidor e ABORTA a subida se falhar. É a diferença
#    entre "o deploy não subiu" e "o deploy subiu e a primeira tela deu 500".
if [ "${MIGRAR_NA_SUBIDA:-true}" != "false" ]; then
  echo "[entrypoint] aplicando migrações pendentes..."
  gosu node node dist/migrar.mjs
else
  echo "[entrypoint] MIGRAR_NA_SUBIDA=false — o schema não será tocado nesta subida."
fi

# 2. O disco dos backups.
#
#    `lib/backup.ts:19` grava em `${cwd}/backups`, e o cwd é /app. Quando esse
#    caminho é um volume do EasyPanel, ele nasce pertencendo a root e o processo
#    (que roda como `node`) não escreveria nele — o botão "Fazer backup agora"
#    falharia com EACCES depois de o deploy ficar verde.
mkdir -p /app/backups
chown node:node /app/backups

exec gosu node "$@"

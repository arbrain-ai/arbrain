#!/bin/sh
# Abre el CLI de un subagente sin pantalla a mano («interactivo», 6 oct 2026) con las credenciales que su adaptador
# declara, leídas del .env del agent-server en el momento: el secreto nunca queda escrito en el comando de la terminal.
# Uso: con-entorno.sh <archivo .env> DESTINO=FUENTE ... -- comando args
env_file=$1; shift
while [ $# -gt 0 ] && [ "$1" != "--" ]; do
  destino=${1%%=*}; fuente=${1#*=}
  valor=$(sed -n "s/^${fuente}=//p" "$env_file" | head -1)
  valor=${valor#\"}; valor=${valor%\"}; valor=${valor#\'}; valor=${valor%\'}
  [ -n "$valor" ] && export "$destino=$valor"
  shift
done
[ "$1" = "--" ] && shift
exec "$@"

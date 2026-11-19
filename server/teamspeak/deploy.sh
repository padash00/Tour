#!/usr/bin/env bash
# Выкладка голосовой связи на cloud-001: миграция базы (если передан файл) и новая версия бота TeamSpeak.
# Запуск из Git Bash:  bash server/teamspeak/deploy.sh [файл-миграции.sql]
# Прежняя версия бота сохраняется как /opt/teamspeak/tools/bot.py.bak.
set -euo pipefail
SSH=/c/Windows/System32/OpenSSH/ssh.exe
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" != "" ]; then
  echo "== миграция базы: $1"
  "$SSH" cloud-001 "docker exec -i tour-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" < "$1"
fi

echo "== бот TeamSpeak"
"$SSH" cloud-001 "cp /opt/teamspeak/tools/bot.py /opt/teamspeak/tools/bot.py.bak && cat > /opt/teamspeak/tools/bot.py && systemctl restart ts-bot && sleep 6 && journalctl -u ts-bot -n 12 --no-pager" < "$HERE/bot.py"
echo "== готово"

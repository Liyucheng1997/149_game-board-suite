#!/usr/bin/env bash
set -euo pipefail
# Upload a release tarball and this installer, then run as root.
archive=$1
release=$2
[[ "$release" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
target="/opt/board-game-suite/releases/$release"
test ! -e "$target"
id board-games >/dev/null 2>&1 || useradd --system --home-dir /var/lib/board-game-suite --shell /usr/sbin/nologin board-games
install -d -o board-games -g board-games -m 700 /var/lib/board-game-suite
install -d "$target"
tar -xzf "$archive" -C "$target"
cd "$target"
npm ci --omit=dev --ignore-scripts
chown -R root:root "$target"
chmod -R a+rX "$target"
previous=$(readlink /opt/board-game-suite/current || true)
ln -sfn "$target" /opt/board-game-suite/current
install -m 644 deploy/board-game-suite.service /etc/systemd/system/board-game-suite.service
systemctl daemon-reload
systemctl enable board-game-suite
systemctl restart board-game-suite
for attempt in {1..15}; do
    if curl -fsS http://127.0.0.1:4399/health; then break; fi
    sleep 1
done
if ! curl -fsS http://127.0.0.1:4399/health; then
    if [ -n "$previous" ]; then
        ln -sfn "$previous" /opt/board-game-suite/current
        systemctl restart board-game-suite
    fi
    exit 1
fi
site=/etc/nginx/sites-available/board.liyucheng.me
if ! grep -q 'location \^~ /games/' "$site"; then
    cp -p "$site" "$site.before-games-$release"
    python3 - "$site" "$target/deploy/games.nginx.conf" <<'PY'
import pathlib, sys
site, snippet = map(pathlib.Path, sys.argv[1:])
text = site.read_text()
marker = '    location / {'
assert marker in text
site.write_text(text.replace(marker, snippet.read_text() + '\n' + marker, 1))
PY
    if ! nginx -t; then
        cp -p "$site.before-games-$release" "$site"
        exit 1
    fi
    systemctl reload nginx
fi
systemctl is-active board-game-suite

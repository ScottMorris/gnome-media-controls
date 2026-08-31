#!/usr/bin/env bash
# Headless smoke test: build+install the extension, run a fake MPRIS player,
# start gnome-shell headlessly with unsafe-mode, and assert real panel state
# via org.gnome.Shell.Eval. Intended to run inside test/headless/Dockerfile.
set -euo pipefail

export HOME=/root
export XDG_RUNTIME_DIR=/tmp/run
export GSETTINGS_BACKEND=keyfile
UUID="mediacontrols@cliffniff.github.com"

mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
rm -rf /run/systemd/seats
mkdir -p /run/dbus
dbus-daemon --system --fork

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
rm -rf dist node_modules
pnpm install
pnpm build
gnome-extensions install --force "dist/builds/${UUID}.shell-extension.zip"

eval "$(dbus-launch --sh-syntax)"
echo "Session bus: $DBUS_SESSION_BUS_ADDRESS"

gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['${UUID}']"

node "$REPO_ROOT/test/headless/fake_mpris_player.mjs" > /tmp/player.log 2>&1 &
PLAYER_PID=$!
sleep 1
echo "--- fake player log ---"
cat /tmp/player.log

gnome-shell --headless --wayland --no-x11 --unsafe-mode --virtual-monitor 1024x768 > /tmp/shell.log 2>&1 &
SHELL_PID=$!

echo "Waiting for org.gnome.Shell on the bus..."
for i in $(seq 1 20); do
    if gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval '1+1' 2>/dev/null | grep -q 'true'; then
        echo "Shell Eval is up after ${i}s"
        break
    fi
    sleep 1
done

echo "--- extension manager lookup (retrying until enabled) ---"
for i in $(seq 1 20); do
    STATE=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval \
        "(async () => { const Main = await import('resource:///org/gnome/shell/ui/main.js'); const e = Main.extensionManager.lookup('${UUID}'); return e ? String(e.state) : 'NOT_FOUND'; })()" 2>&1)
    echo "  [$i] $STATE"
    echo "$STATE" | grep -q '"1"' && break
    sleep 1
done

echo "Waiting for the fake player to be discovered and rendered..."
FOUND=0
for i in $(seq 1 20); do
    RESULT=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval \
        "(async () => { const Main = await import('resource:///org/gnome/shell/ui/main.js'); const e = Main.extensionManager.lookup('${UUID}'); if (!e || !e.stateObj) return 'no-instance'; const ext = e.stateObj; if (!ext.panelBtn) return 'no-panel'; const t = ext.panelBtn.menuLabelTitle; return t && t.label ? t.label.text : 'no-label'; })()" 2>&1)
    echo "  [$i] $RESULT"
    if echo "$RESULT" | grep -q "Test Track"; then
        FOUND=1
        break
    fi
    sleep 1
done

echo "--- shell.log tail ---"
tail -30 /tmp/shell.log

kill "$PLAYER_PID" 2>/dev/null || true
kill "$SHELL_PID" 2>/dev/null || true
wait "$SHELL_PID" 2>/dev/null || true

if [ "$FOUND" -eq 1 ]; then
    echo "SMOKE TEST PASSED: panel title reflects fake player's metadata"
    exit 0
else
    echo "SMOKE TEST FAILED: panel title never showed 'Test Track'"
    exit 1
fi

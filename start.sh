#!/bin/bash
set -e

# Apply VNC password if set
if [ -n "$VNC_PASSWORD" ]; then
    mkdir -p /root/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /root/.vnc/passwd
    # Patch supervisord config to use password file
    sed -i 's|-nopw|-rfbauth /root/.vnc/passwd|' /etc/supervisor/conf.d/supervisord.conf
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

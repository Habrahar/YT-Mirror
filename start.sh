#!/bin/bash
set -e

# Start PulseAudio with a unix socket Chromium can find
pulseaudio -D \
    --exit-idle-time=-1 \
    --log-level=error \
    --load="module-native-protocol-unix auth-anonymous=1 socket=/tmp/pulse-socket" \
    --load="module-always-sink"

sleep 2

# Create virtual output sink (audio goes here, ffmpeg reads from its monitor)
pactl load-module module-null-sink sink_name=virtual_out sink_properties=device.description="VirtualOutput"
pactl set-default-sink virtual_out

# Apply VNC password if set
if [ -n "$VNC_PASSWORD" ]; then
    mkdir -p /root/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /root/.vnc/passwd
    sed -i 's|-nopw|-rfbauth /root/.vnc/passwd|' /etc/supervisor/conf.d/supervisord.conf
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

#!/bin/bash
set -e

# Start PulseAudio with a unix socket
pulseaudio -D \
    --exit-idle-time=-1 \
    --log-level=error \
    --load="module-native-protocol-unix auth-anonymous=1 socket=/tmp/pulse-socket" \
    --load="module-always-sink"

sleep 2

# Virtual sink — Chromium outputs here, ffmpeg reads from its monitor
pactl load-module module-null-sink \
    sink_name=virtual_out \
    sink_properties=device.description="VirtualOutput"
pactl set-default-sink virtual_out

# Убираем lock-файлы Chromium — иначе он думает что уже запущен
rm -f /data/chrome-profile/SingletonLock \
      /data/chrome-profile/SingletonCookie \
      /data/chrome-profile/SingletonSocket

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

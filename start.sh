#!/bin/bash
set -e

# Очищаем возможные остатки от прошлого запуска
rm -rf /var/run/pulse /tmp/pulse-*

# PulseAudio в system-режиме — единственный способ запустить от root в Docker
pulseaudio --system \
    --disallow-exit \
    --disallow-module-loading=false \
    --log-level=error \
    --exit-idle-time=-1 &

sleep 3

# Virtual sink — Chromium outputs here, ffmpeg reads from its monitor
pactl --server unix:/var/run/pulse/native load-module module-null-sink \
    sink_name=virtual_out \
    sink_properties=device.description="VirtualOutput"
pactl --server unix:/var/run/pulse/native set-default-sink virtual_out

# Убираем lock-файлы Chromium — иначе он думает что уже запущен
rm -f /data/chrome-profile/SingletonLock \
      /data/chrome-profile/SingletonCookie \
      /data/chrome-profile/SingletonSocket

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

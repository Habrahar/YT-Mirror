#!/bin/bash
set -e

# D-Bus нужен PulseAudio в system-режиме
mkdir -p /var/run/dbus
dbus-daemon --system --fork --nopidfile || true
sleep 1

# PulseAudio через конфиг-файл — никаких pactl, никакого D-Bus в рантайме
rm -f /var/run/pulse/native /var/run/pulse/*.pid
mkdir -p /var/run/pulse
pulseaudio --system \
    --disallow-exit \
    --disallow-module-loading=false \
    --log-level=error \
    --exit-idle-time=-1 \
    --file=/etc/pulse/system.pa &

sleep 3

# Убираем lock-файлы Chromium
rm -f /data/chrome-profile/SingletonLock \
      /data/chrome-profile/SingletonCookie \
      /data/chrome-profile/SingletonSocket

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

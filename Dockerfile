FROM debian:bookworm-slim

ENV DISPLAY=:99
ENV SCREEN_WIDTH=390
ENV SCREEN_HEIGHT=844
ENV SCREEN_DEPTH=24
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080
ENV AUDIO_PORT=8888

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    x11vnc \
    xvfb \
    novnc \
    websockify \
    supervisor \
    pulseaudio \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/chrome-profile /var/log/supervisor

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY hide-video.js /hide-video.js
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080 5900 8888

CMD ["/start.sh"]

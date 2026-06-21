FROM debian:bookworm-slim

ENV DISPLAY=:99
ENV SCREEN_WIDTH=1280
ENV SCREEN_HEIGHT=800
ENV SCREEN_DEPTH=24
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    x11vnc \
    xvfb \
    novnc \
    websockify \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/chrome-profile /var/log/supervisor

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080 5900

CMD ["/start.sh"]

FROM debian:bookworm-slim

ENV APP_PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    nodejs \
    npm \
    pulseaudio \
    ffmpeg \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/chrome-profile /var/log/supervisor

WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ .

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000

CMD ["/start.sh"]

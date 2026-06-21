const express = require('express');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.APP_PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let page = null;
let lastTrack = null;

// --- Audio stream: каждый клиент получает свой ffmpeg процесс ---
app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const ff = spawn('ffmpeg', [
        '-f', 'pulse', '-i', 'virtual_out.monitor',
        '-acodec', 'libmp3lame', '-b:a', '128k',
        '-f', 'mp3', '-'
    ]);

    ff.stdout.pipe(res);
    ff.stderr.on('data', () => {}); // подавляем вывод ffmpeg

    req.on('close', () => ff.kill('SIGKILL'));
});

// --- Парсинг состояния плеера ---
async function getPlayerState() {
    if (!page) return null;
    try {
        return await page.evaluate(() => {
            const bar = document.querySelector('ytmusic-player-bar');
            if (!bar) return null;

            const title = bar.querySelector('yt-formatted-string.title')?.textContent?.trim();
            const artist = bar.querySelector('.byline yt-formatted-string')?.textContent?.trim();
            const thumb = bar.querySelector('img.thumbnail')?.src;
            const playBtn = bar.querySelector('#play-pause-button');
            const isPlaying = playBtn?.getAttribute('title') === 'Pause'
                           || playBtn?.getAttribute('aria-label') === 'Pause';

            return { title: title || null, artist: artist || null, thumb: thumb || null, isPlaying };
        });
    } catch {
        return null;
    }
}

// --- Команды управления ---
app.post('/command', async (req, res) => {
    const { action } = req.body;
    if (!page) return res.json({ ok: false, error: 'not ready' });

    try {
        await page.evaluate((action) => {
            const bar = document.querySelector('ytmusic-player-bar');
            if (!bar) return;
            const map = {
                toggle: '#play-pause-button',
                next:   '.next-button',
                prev:   '.previous-button',
            };
            bar.querySelector(map[action])?.click();
        }, action);
        res.json({ ok: true });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

// --- WebSocket: рассылка обновлений плеера ---
function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(msg);
    });
}

wss.on('connection', (ws) => {
    if (lastTrack) ws.send(JSON.stringify({ type: 'track', data: lastTrack }));
});

setInterval(async () => {
    const state = await getPlayerState();
    if (!state) return;
    if (JSON.stringify(state) !== JSON.stringify(lastTrack)) {
        lastTrack = state;
        broadcast({ type: 'track', data: state });
    }
}, 2000);

// --- Запуск Chromium через puppeteer ---
async function start() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--autoplay-policy=no-user-gesture-required',
            '--user-data-dir=/data/chrome-profile',
        ],
    });

    page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    await page.setViewport({ width: 390, height: 844 });
    await page.goto('https://music.youtube.com', { waitUntil: 'networkidle2', timeout: 60000 });

    server.listen(PORT, () => console.log(`YTMirror running on :${PORT}`));
}

start().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
});

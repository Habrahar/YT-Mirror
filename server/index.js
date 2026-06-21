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

const ITEM_SEL = 'ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer';

// --- Browse: извлечь структуру текущей страницы ---
app.get('/page', async (req, res) => {
    if (!page) return res.status(503).json({ error: 'not ready' });
    try {
        const data = await page.evaluate((ITEM_SEL) => {
            const getText = (el, sels) => {
                for (const s of sels) {
                    const t = el.querySelector(s)?.textContent?.trim();
                    if (t) return t;
                }
                return '';
            };
            const getThumb = (el) => {
                return el.querySelector('img.yt-img-shadow, img[src*="googleusercontent"], img[src*="ggpht"], img')?.src || '';
            };

            const allItems = Array.from(document.querySelectorAll(ITEM_SEL));
            const usedIdx = new Set();
            const sections = [];

            document.querySelectorAll('ytmusic-shelf, ytmusic-carousel-shelf').forEach(shelf => {
                const title = getText(shelf, [
                    '.title yt-formatted-string',
                    'ytmusic-carousel-shelf-basic-header-renderer .title yt-formatted-string',
                    'h2 yt-formatted-string',
                ]);
                const items = [];
                shelf.querySelectorAll(ITEM_SEL).forEach(el => {
                    const idx = allItems.indexOf(el);
                    if (idx === -1) return;
                    usedIdx.add(idx);
                    items.push({
                        idx,
                        title:    getText(el, ['.title yt-formatted-string', 'yt-formatted-string.title']),
                        subtitle: getText(el, ['.subtitle yt-formatted-string', '.byline yt-formatted-string', 'yt-formatted-string.subtitle']),
                        thumb:    getThumb(el),
                    });
                });
                if (items.length) sections.push({ title: title || null, items });
            });

            // Элементы не попавшие ни в одну секцию
            const loose = allItems
                .map((el, idx) => ({ el, idx }))
                .filter(({ idx }) => !usedIdx.has(idx))
                .map(({ el, idx }) => ({
                    idx,
                    title:    getText(el, ['.title yt-formatted-string', 'yt-formatted-string.title']),
                    subtitle: getText(el, ['.subtitle yt-formatted-string', '.byline yt-formatted-string']),
                    thumb:    getThumb(el),
                }));
            if (loose.length) sections.push({ title: null, items: loose });

            return { url: location.href, pageTitle: document.title, sections };
        }, ITEM_SEL);

        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Browse: кликнуть на элемент по индексу ---
app.post('/page/click', async (req, res) => {
    if (!page) return res.json({ ok: false });
    try {
        const { idx } = req.body;
        await page.evaluate((idx, ITEM_SEL) => {
            const el = document.querySelectorAll(ITEM_SEL)[idx];
            if (!el) return;
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            // Пробуем кликнуть кнопку воспроизведения, иначе сам элемент
            const playBtn = el.querySelector('ytmusic-play-button-renderer, .play-button');
            if (playBtn) {
                playBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                playBtn.click();
            } else {
                el.click();
            }
        }, idx, ITEM_SEL);
        await new Promise(r => setTimeout(r, 800));
        res.json({ ok: true });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

// --- Browse: назад ---
app.post('/page/back', async (req, res) => {
    if (!page) return res.json({ ok: false });
    await page.goBack().catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    res.json({ ok: true });
});

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

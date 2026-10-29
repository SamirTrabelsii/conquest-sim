// Renders the next episode to MP4, frame by frame, with no screen recording.
//
//   npm run render                  next episode from public/saves/latest.json
//   npm run render -- --fresh       start a fresh world (episode 1)
//   npm run render -- --seconds 10  only the first 10 s (nothing is saved)
//   npm run render -- --dry         full render, but don't touch saves or logs
//   npm run render -- --seed 123    override the seed
//
// The app runs in headless Chrome on a virtual clock: time only moves when
// this script advances it, one frame at a time, so the video never stutters
// however slow capturing is. Frames are piped straight into ffmpeg.

import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    fresh: { type: 'boolean' },
    dry: { type: 'boolean' },
    seconds: { type: 'string' },
    seed: { type: 'string' },
  },
});
const partial = args.seconds !== undefined;
const PREVIEW_PORT = 4199;
const STARTUP_TIMEOUT_MS = 120_000;

const log = (msg) => console.log(`[render] ${msg}`);
const path = (...parts) => resolve(root, ...parts);

// 1. Build and serve the app as static files (no hot reload mid-render).
log('building app…');
await build({ root, logLevel: 'error' });
const server = await preview({ root, logLevel: 'error', preview: { port: PREVIEW_PORT, strictPort: false } });
const base = server.resolvedUrls.local[0];

// 2. Open it in headless Chrome on the virtual clock.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => {
    failed = true;
    console.error('[render] page error:', err);
  });
  const flags = ['render', 'autostart'];
  if (args.fresh) flags.push('fresh');
  if (args.seed) flags.push(`seed=${encodeURIComponent(args.seed)}`);
  await page.goto(`${base}?${flags.join('&')}`);
  await page.waitForFunction(() => window.__render, null, { timeout: STARTUP_TIMEOUT_MS });
  const { episode, render, stage } = await page.evaluate(() => {
    const { episode, render, stage } = window.__render;
    return { episode, render, stage };
  });
  await page.setViewportSize(stage);
  const { fps, tailSeconds, jpegQuality, crf, preset } = render;
  const frameMs = 1000 / fps;

  const tag = `ep${String(episode).padStart(3, '0')}`;
  const name = `${tag}${args.dry ? '.dry' : ''}${partial ? '.partial' : ''}`;
  await mkdir(path('renders'), { recursive: true });
  const out = path('renders', `${name}.mp4`);
  log(`episode ${episode} → ${relative(root, out)} (${fps} fps)`);

  // 3. Pipe frames into ffmpeg.
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    // JPEG frames are full-range; convert to the standard TV range that
    // Shorts / Reels / TikTok expect, or colours look washed out.
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-r', String(fps), '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const encoded = new Promise((ok, fail) =>
    ffmpeg.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))),
  );

  // 4. Capture, advance one frame, repeat — until the episode is done plus
  //    a short hold on the final card (or until --seconds).
  const limit = partial ? Number(args.seconds) * fps : Infinity;
  const hashes = [];
  const started = Date.now();
  let frame = 0;
  let endFrame = Infinity;
  while (frame < limit && frame < endFrame) {
    const shot = await page.screenshot({ type: 'jpeg', quality: jpegQuality });
    hashes.push(createHash('sha256').update(shot).digest('hex'));
    if (!ffmpeg.stdin.write(shot)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
    frame++;
    const done = await page.evaluate(async (ms) => {
      await window.__render.advance(ms);
      return window.__render.done;
    }, frameMs);
    if (done && endFrame === Infinity) endFrame = frame + tailSeconds * fps;
    if (frame % fps === 0) {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`\r[render] ${frame / fps}s of video in ${secs}s`);
    }
  }
  process.stdout.write('\n');
  ffmpeg.stdin.end();
  await encoded;
  await writeFile(path('renders', `${name}.frames.txt`), hashes.join('\n') + '\n');
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  log(`${frame} frames (${(frame / fps).toFixed(1)}s of video) in ${minutes} min`);

  // 5. Write the logs and the next save straight into the project.
  if (failed) throw new Error('page errors during render; saves left untouched');
  if (partial || args.dry) {
    log('partial or dry run: saves and logs left untouched');
  } else if (endFrame === Infinity) {
    throw new Error('episode did not finish; saves left untouched');
  } else {
    const files = await page.evaluate(() => window.episodeFiles);
    await mkdir(path('logs'), { recursive: true });
    await mkdir(path('public', 'saves'), { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      const dest = file.startsWith('world-') ? path('public', 'saves', file) : path('logs', file);
      await writeFile(dest, content);
      log(`wrote ${relative(root, dest)}`);
    }
    const world = Object.entries(files).find(([file]) => file.startsWith('world-'))[1];
    await writeFile(path('public', 'saves', 'latest.json'), world);
    log('updated public/saves/latest.json (the next render plays the next episode)');
  }
} finally {
  await browser.close();
  await new Promise((ok) => server.httpServer.close(ok));
}

// Racing smoke test: boots the current source through Vite, drives a real car, walks the race
// lifecycle, checks the three circuits and mobile HUD, and writes screenshots to ./shots/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  stdio: 'ignore',
  detached: false,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
})
let browser
const guard = setTimeout(() => fail('timed out'), 180_000)
function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('Vite server did not start')
}
const gameState = page => page.evaluate(() => {
  const { game, online } = window.__game
  return {
    mode: game.mode,
    speed: game.car.speed,
    progress: game.car.t,
    lateral: game.car.lateral,
    elapsed: game.race?.elapsedMs ?? 0,
    lap: game.race?.lap ?? 0,
    phase: game.race?.phase ?? null,
    online: online.status,
    track: game.selectedTrackId,
    carFallback: game.carVisual['fallback'],
  }
})
async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => {
    const target = response.url()
    if (response.status() >= 400 && !target.includes('/api/') && !target.endsWith('/favicon.ico')) errors.push(`HTTP ${response.status()} ${target}`)
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('section.screen-title.is-active', { timeout: 60_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    const display = getComputedStyle(document.querySelector('.hero-wordmark')).fontFamily
    if (!display.includes('ManusCC0')) throw new Error(`Unexpected display font: ${display}`)
  })
  await page.evaluate(() => {
    window.__game.game.setQuality('low')
    // The smoke path verifies local race settlement without creating a global score.
    window.__game.online.beginRun = async () => { throw new Error('smoke_offline') }
  })
  await page.waitForTimeout(500)
  return page
}
async function waitForPlaying(page) {
  await page.waitForFunction(() => window.__game.game.mode === 'playing', null, { timeout: 45_000 })
}
try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--disable-background-timer-throttling'] })
  const errors = []
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  const page = await openGame(desktop, errors)
  await page.screenshot({ path: `${out}/01-title.png` })
  const title = await gameState(page)
  if (title.carFallback) throw new Error('generated hero car fell back to procedural geometry')
  for (const id of ['canyon', 'vault', 'harbor']) {
    await page.click(`.track-card[data-track-card="${id}"]`)
    await page.waitForTimeout(250)
    if ((await gameState(page)).track !== id) throw new Error(`track selection failed for ${id}`)
  }
  await page.click('.btn-start')
  await waitForPlaying(page)
  const before = await gameState(page)
  await page.keyboard.down('w')
  await page.waitForFunction(() => window.__game.game.car.speed > 5, null, { timeout: 25_000 })
  await page.waitForTimeout(350)
  await page.keyboard.up('w')
  const after = await gameState(page)
  if (!(after.speed > 5)) throw new Error(`car did not accelerate (${after.speed.toFixed(2)} m/s)`)
  if (!(after.progress > before.progress)) throw new Error('car did not advance along the circuit')
  await page.screenshot({ path: `${out}/02-race.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('section.screen-pause.is-active')
  await page.click('section.screen-pause [data-action="settings"]')
  await page.waitForSelector('section.screen-settings.is-active')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/03-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('section.screen-pause.is-active')
  if ((await gameState(page)).mode !== 'paused') throw new Error('Escape from settings did not return to the paused race')
  await page.click('section.screen-pause [data-action="resume"]')
  await page.waitForTimeout(250)
  await page.evaluate(() => {
    const { game } = window.__game
    if (!game.race) throw new Error('missing race state')
    game.race.lap = game.race.laps
    game.race.elapsedMs = 78_000
    game.race.lapStartedMs = 0
    game.car.t = 0.97
    game.car.lateral = 0
    game.car.speed = 34
  })
  await page.waitForSelector('section.screen-results.is-active', { timeout: 30_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/04-results.png` })
  const result = await gameState(page)
  if (result.mode !== 'ended' || result.phase !== 'finished') throw new Error(`race did not finish (${result.mode}/${result.phase})`)
  await desktop.close()

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const phone = await openGame(mobile, errors)
  await phone.screenshot({ path: `${out}/05-mobile-title.png` })
  await phone.click('.btn-start')
  await waitForPlaying(phone)
  await phone.waitForTimeout(300)
  await phone.screenshot({ path: `${out}/06-mobile-race.png` })
  const layout = await phone.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON()
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      timer: box('.hud-timer-block'),
      pause: box('.hud-pause'),
      speed: box('.hud-speed'),
      touch: box('.touch-actions'),
      touchVisible: getComputedStyle(document.querySelector('.touch-controls')).display,
    }
  })
  if (layout.scrollWidth > layout.width) throw new Error(`mobile horizontal overflow (${layout.scrollWidth}px > ${layout.width}px)`)
  if (layout.timer.right > layout.pause.left) throw new Error('mobile timer overlaps the pause button')
  if (layout.speed.bottom > layout.touch.top) throw new Error('mobile speed readout overlaps the touch actions')
  if (layout.touchVisible === 'none') throw new Error('touch controls are not visible on a coarse-pointer device')
  await mobile.close()
  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log('smoke: OK — title, hero car, 3 circuits, driving, pause/settings, results, and mobile HUD verified')
} catch (error) {
  await fail(error?.message ?? String(error))
}

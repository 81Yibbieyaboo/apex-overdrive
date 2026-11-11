import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { SaveData } from '../engine/save'
import type { SaveStore } from '../engine/save'
import type { BannerTone, HudSnapshot } from '../game/game'
import { formatRaceTime, formatShortTime } from '../game/rules'
import { TRACKS, trackMapPoints, trackSvg, type TrackDef, type TrackId } from '../game/tracks'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'leaderboard' | 'results'
export type OnlineStatus = 'idle' | 'connecting' | 'ready' | 'offline'
export type ScoreStatus = 'idle' | 'pending' | 'success' | 'error' | 'unranked'
export type BoardEntry = { rank: number; name: string; timeMs: number; isMe?: boolean }
export type BoardView = { entries: BoardEntry[]; myRank?: number; error?: string; loading?: boolean }

export type UiActions = {
  selectTrack: (id: TrackId) => void
  start: () => void
  restart: () => void
  resume: () => void
  quit: () => void
  pause: () => void
  settings: (patch: Partial<SaveData>) => void
  leaderboard: (track: TrackId) => void
  retryScore: () => void
}

const icon = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l9 8-9 8 4 1 11-9L10 3z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
}

const FEATURE_LABEL: Record<TrackId, string> = {
  harbor: '2 RAMPS  ·  FLOWING',
  canyon: '3 RAMPS  ·  BIG AIR',
  vault: '2 RAMPS  ·  WALL RIDE',
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
}

export class Ui {
  screen: Screen = 'boot'
  selectedTrack: TrackId = 'harbor'
  boardTrack: TrackId = 'harbor'
  private stack: Screen[] = []
  private bannerTimer = 0
  private goTimer = 0
  private countdownShown = ''
  private lastMode = ''
  private lastMinimapTrack = ''
  private board: BoardView = { entries: [], loading: true }
  private onlineLabel = 'GLOBAL BOARD'
  private lastHud = new Map<string, string>()
  private navRepeat = 0
  private listeners: Array<() => void> = []
  private result: { totalMs: number; bestLapMs: number; lapTimesMs: number[]; track: TrackDef; raceBest: boolean; lapBest: boolean } | null = null

  constructor(
    private readonly root: HTMLElement,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.selectedTrack = save.data.lastTrack
    this.boardTrack = this.selectedTrack
    root.innerHTML = this.template()
    this.bind()
    this.refreshAll()
  }

  private on(target: EventTarget, type: string, fn: (event: Event) => void): void {
    target.addEventListener(type, fn)
    this.listeners.push(() => target.removeEventListener(type, fn))
  }

  private bind(): void {
    this.on(this.root, 'click', event => this.onClick(event as MouseEvent))
    this.on(this.root, 'input', event => this.onInput(event as Event))
    this.on(this.root, 'change', event => this.onChange(event as Event))
    this.on(window, 'keydown', event => this.onKey(event as KeyboardEvent))
    this.on(this.root, 'pointerdown', () => this.audio.unlock())
    this.on(window, 'game:pause', () => this.actions.pause())
  }

  private q<T extends Element = HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector)
    if (!el) throw new Error(`Missing UI node ${selector}`)
    return el
  }

  private qa<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return [...this.root.querySelectorAll<T>(selector)]
  }

  show(screen: Screen): void {
    if (screen === 'settings' || screen === 'leaderboard') {
      if (this.screen !== screen) this.stack.push(this.screen)
    }
    this.screen = screen
    for (const section of this.qa<HTMLElement>('[data-screen]')) {
      section.classList.toggle('is-active', section.dataset.screen === screen)
      section.setAttribute('aria-hidden', String(section.dataset.screen !== screen))
    }
    this.root.dataset.screen = screen
    document.body.dataset.screen = screen
    if (screen === 'leaderboard') this.renderBoard()
    if (screen === 'settings') this.refreshSettings()
    window.setTimeout(() => this.focusFirst(), 40)
  }

  private back(): void {
    const previous = this.stack.pop()
    if (previous) this.show(previous)
    else if (this.screen === 'leaderboard' || this.screen === 'settings') this.show('title')
  }

  private focusFirst(): void {
    if (this.screen === 'hud') return
    const screen = this.q(`[data-screen="${this.screen}"]`)
    const focusable = screen.querySelector<HTMLElement>('[data-nav]:not([disabled]), button:not([disabled]), input:not([disabled])')
    focusable?.focus({ preventScroll: true })
  }

  setBootProgress(fraction: number, label: string): void {
    const bar = this.q<HTMLElement>('.boot-bar i')
    bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`
    this.q('.boot-label').textContent = label
  }

  setBootError(message: string): void {
    this.q('.boot-error').textContent = message
    this.q('.boot-error').classList.add('is-visible')
    this.q<HTMLButtonElement>('.boot-retry').hidden = false
  }

  setSelectedTrack(id: TrackId): void {
    this.selectedTrack = id
    this.boardTrack = id
    this.refreshTitle()
    this.refreshBoardTabs()
    this.lastMinimapTrack = ''
  }

  refreshAll(): void {
    this.refreshTitle()
    this.refreshSettings()
    this.refreshBoardTabs()
  }

  refreshTitle(): void {
    const track = TRACKS.find(t => t.id === this.selectedTrack) ?? TRACKS[0]
    for (const card of this.qa<HTMLElement>('[data-track-card]')) card.classList.toggle('is-selected', card.dataset.trackCard === track.id)
    this.q('.selected-track-number').textContent = track.number
    this.q('.selected-track-name').textContent = track.name
    this.q('.selected-track-subtitle').textContent = track.subtitle
    this.q('.selected-track-desc').textContent = track.description
    this.q('.selected-track-meta').innerHTML = `<span>${track.laps} LAPS</span><span>${track.width} M WIDE</span><span>${FEATURE_LABEL[track.id]}</span>`
    this.q('.selected-track-tagline').textContent = track.tagline
    this.q('.selected-track-difficulty').textContent = track.difficulty
    const best = this.save.data.trackBests[track.id]
    this.q('.selected-track-best').textContent = best ? `PB  ${formatRaceTime(best.raceMs)}` : 'NO TIME SET'
    this.q('.start-label').textContent = best ? 'BEAT YOUR TIME' : 'START ENGINE'
    this.q<HTMLElement>('.title-track-accent').style.background = track.accent
    for (const card of this.qa<HTMLElement>('[data-track-card]')) {
      const bestForCard = this.save.data.trackBests[card.dataset.trackCard as TrackId]
      const slot = card.querySelector<HTMLElement>('.track-card-best')
      if (slot) slot.textContent = bestForCard ? formatShortTime(bestForCard.raceMs) : '—'
    }
  }

  private refreshBoardTabs(): void {
    for (const tab of this.qa<HTMLElement>('[data-board-track]')) tab.classList.toggle('is-selected', tab.dataset.boardTrack === this.boardTrack)
  }

  setOnlineStatus(status: OnlineStatus, label?: string): void {
    this.onlineLabel = label ?? (status === 'ready' ? 'GLOBAL BOARD' : status === 'connecting' ? 'CONNECTING' : 'LOCAL MODE')
    for (const chip of this.qa<HTMLElement>('.online-chip')) {
      chip.dataset.status = status
      chip.querySelector('span')!.textContent = this.onlineLabel
    }
  }

  setBoard(board: BoardView): void {
    this.board = board
    if (this.screen === 'leaderboard') this.renderBoard()
  }

  private renderBoard(): void {
    this.refreshBoardTabs()
    const track = TRACKS.find(t => t.id === this.boardTrack) ?? TRACKS[0]
    this.q('.board-track-name').textContent = track.name
    this.q('.board-track-sub').textContent = `${track.number}  //  ${track.subtitle}  //  TWO-LAP TIME`
    const status = this.q('.board-status')
    if (this.board.loading) {
      status.textContent = 'READING THE GLOBAL TIMING SCREEN…'
      status.className = 'board-status is-loading'
    } else if (this.board.error) {
      status.textContent = `ONLINE BOARD UNAVAILABLE · ${this.board.error.replace(/_/g, ' ')}`
      status.className = 'board-status is-error'
    } else {
      status.textContent = this.board.entries.length ? 'OFFICIAL GUEST CLASSIFICATION' : 'NO GLOBAL TIMES YET. SET THE PACE.'
      status.className = 'board-status'
    }
    const list = this.q<HTMLOListElement>('.board-list')
    list.innerHTML = ''
    const best = this.save.data.trackBests[track.id]
    const localRow = document.createElement('li')
    localRow.className = 'board-row is-local'
    localRow.innerHTML = `<b>—</b><span class="board-name">${esc(this.save.data.playerName)}</span><span class="board-time">${best ? formatRaceTime(best.raceMs) : '—'}</span><em>LOCAL PB</em>`
    list.append(localRow)
    for (const entry of this.board.entries) {
      const li = document.createElement('li')
      li.className = `board-row${entry.isMe ? ' is-me' : ''}`
      li.innerHTML = `<b>${entry.rank}</b><span class="board-name">${esc(entry.name)}</span><span class="board-time">${formatRaceTime(entry.timeMs)}</span><em>${entry.isMe ? 'YOU' : 'GUEST'}</em>`
      list.append(li)
    }
  }

  refreshSettings(): void {
    const d = this.save.data
    const music = this.q<HTMLInputElement>('[name="musicVolume"]')
    const sfx = this.q<HTMLInputElement>('[name="sfxVolume"]')
    music.value = String(d.musicVolume)
    sfx.value = String(d.sfxVolume)
    this.q('.music-value').textContent = `${Math.round(d.musicVolume * 100)}%`
    this.q('.sfx-value').textContent = `${Math.round(d.sfxVolume * 100)}%`
    music.style.setProperty('--fill', `${d.musicVolume * 100}%`)
    sfx.style.setProperty('--fill', `${d.sfxVolume * 100}%`)
    this.q<HTMLInputElement>('[name="playerName"]').value = d.playerName
    const mute = this.q<HTMLButtonElement>('[data-setting="muted"]')
    mute.setAttribute('aria-pressed', String(d.muted))
    mute.querySelector('span')!.textContent = d.muted ? 'OFF' : 'ON'
    const motion = this.q<HTMLButtonElement>('[data-setting="reducedMotion"]')
    motion.setAttribute('aria-pressed', String(d.reducedMotion))
    motion.querySelector('span')!.textContent = d.reducedMotion ? 'ON' : 'OFF'
    for (const b of this.qa<HTMLButtonElement>('[data-quality]')) b.setAttribute('aria-pressed', String(b.dataset.quality === d.quality))
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-track-card], [data-board-track], [data-quality], [data-setting]')
    if (!target) return
    this.audio.unlock()
    const action = target.dataset.action
    if (action === 'retry-boot') { location.reload(); return }
    if (target.dataset.trackCard) {
      const id = target.dataset.trackCard as TrackId
      this.selectedTrack = id
      this.boardTrack = id
      this.actions.selectTrack(id)
      this.refreshTitle()
      this.refreshBoardTabs()
      this.audio.play('ui')
      return
    }
    if (target.dataset.boardTrack) {
      this.boardTrack = target.dataset.boardTrack as TrackId
      this.board = { entries: [], loading: true }
      this.refreshBoardTabs()
      this.renderBoard()
      this.actions.leaderboard(this.boardTrack)
      this.audio.play('ui')
      return
    }
    if (target.dataset.quality) {
      this.actions.settings({ quality: target.dataset.quality as SaveData['quality'] })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    if (target.dataset.setting) {
      const key = target.dataset.setting as 'muted' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] } as Partial<SaveData>)
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    switch (action) {
      case 'start':
        this.audio.play('ui')
        this.actions.start()
        break
      case 'restart':
        this.audio.play('ui')
        this.actions.restart()
        break
      case 'resume':
        this.audio.play('ui')
        this.actions.resume()
        break
      case 'pause':
        this.audio.play('ui')
        this.actions.pause()
        break
      case 'quit':
        this.audio.play('ui')
        this.stack = []
        this.actions.quit()
        break
      case 'settings':
        this.audio.play('ui')
        this.show('settings')
        break
      case 'leaderboard':
        this.audio.play('ui')
        this.board = { entries: [], loading: true }
        this.show('leaderboard')
        this.actions.leaderboard(this.boardTrack)
        break
      case 'back':
        this.audio.play('ui')
        this.back()
        break
      case 'retry-score':
        this.audio.play('ui')
        this.actions.retryScore()
        break
    }
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement
    if (input.type === 'range') {
      const patch = { [input.name]: Number(input.value) } as Partial<SaveData>
      this.actions.settings(patch)
      input.style.setProperty('--fill', `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`)
      if (input.name === 'musicVolume') this.q('.music-value').textContent = `${Math.round(Number(input.value) * 100)}%`
      if (input.name === 'sfxVolume') this.q('.sfx-value').textContent = `${Math.round(Number(input.value) * 100)}%`
    }
  }

  private onChange(event: Event): void {
    const input = event.target as HTMLInputElement
    if (input.name === 'playerName') {
      this.actions.settings({ playerName: input.value })
      this.refreshSettings()
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    const typing = (event.target as HTMLElement | null)?.matches?.('input[type="text"], textarea')
    if ((event.code === 'Escape' || (event.code === 'Backspace' && !typing)) && this.screen !== 'title') {
      if (this.screen === 'pause' || this.screen === 'results') return
      event.preventDefault()
      this.input.consume('pause')
      this.back()
      return
    }
    if ((event.code === 'ArrowDown' || event.code === 'ArrowUp') && !typing) {
      event.preventDefault()
      this.moveFocus(event.code === 'ArrowDown' ? 1 : -1)
    }
  }

  private navItems(): HTMLElement[] {
    const screen = this.q(`[data-screen="${this.screen}"]`)
    return [...screen.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => !el.hidden && !el.closest('.is-hidden') && el.offsetParent !== null)
  }

  private moveFocus(direction: 1 | -1): void {
    const items = this.navItems()
    if (!items.length) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = (current + direction + items.length) % items.length
    items[next].focus({ preventScroll: true })
  }

  frame(frameSeconds: number): void {
    this.bannerTimer = Math.max(0, this.bannerTimer - frameSeconds)
    if (this.bannerTimer <= 0) this.q('.race-banner').classList.remove('is-visible')
    this.goTimer = Math.max(0, this.goTimer - frameSeconds)
    if (this.goTimer <= 0) this.q('.go-flash').classList.remove('is-visible')
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.input.method !== 'gamepad') {
      this.input.consume('confirm')
      this.input.consume('back')
      return
    }
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const y = this.input.move.y
    const x = this.input.move.x
    if (Math.abs(y) > 0.65 && this.navRepeat <= 0) {
      this.moveFocus(y < 0 ? 1 : -1)
      this.navRepeat = 0.22
    } else if (Math.abs(y) < 0.3) this.navRepeat = 0
    if (this.input.consume('confirm')) (document.activeElement as HTMLElement | null)?.click()
    if (this.input.consume('back')) {
      if (this.screen === 'pause') this.actions.resume()
      else if (this.screen !== 'title' && this.screen !== 'results') this.back()
    }
    if (Math.abs(x) > 0.7 && this.navRepeat <= 0 && document.activeElement?.parentElement?.matches('.seg')) {
      const sibling = (Math.sign(x) > 0 ? document.activeElement.nextElementSibling : document.activeElement.previousElementSibling) as HTMLElement | null
      sibling?.focus()
      this.navRepeat = 0.2
    }
  }

  banner(text: string, tone: BannerTone): void {
    const el = this.q('.race-banner')
    el.textContent = text
    el.className = `race-banner tone-${tone} is-visible`
    this.bannerTimer = tone === 'finish' ? 3.4 : 1.5
    el.animate([{ transform: 'translateY(12px) scale(.94)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }

  updateHud(hud: HudSnapshot): void {
    const race = hud.race
    const total = race ? race.elapsedMs : 0
    const lap = race ? Math.min(race.lap, race.laps) : 1
    this.setText('lap-current', String(lap).padStart(2, '0'))
    this.setText('lap-total', String(hud.track.laps))
    this.setText('hud-track', hud.track.name.toUpperCase())
    this.setText('total-time', formatRaceTime(total))
    this.setText('lap-time', formatRaceTime(hud.lapTimeMs))
    this.setText('speed', String(hud.speedKph).padStart(3, '0'))
    this.setText('gear', `G${hud.gear}`)
    this.setText('boost-pct', `${Math.round(hud.boost * 100)}`)
    this.q<HTMLElement>('.boost-fill').style.width = `${Math.max(0, Math.min(1, hud.boost)) * 100}%`
    this.q('.screen-hud').style.setProperty('--speed', String(Math.min(1, hud.speedKph / 210)))
    this.q('.screen-hud').classList.toggle('is-wall', hud.wallRiding)
    this.q('.screen-hud').classList.toggle('is-drift', hud.drifting)
    this.q('.screen-hud').classList.toggle('is-air', hud.airborne)
    this.q('.screen-hud').classList.toggle('is-boost', hud.boost > 0.02 && hud.speedKph > 0)
    this.q('.ranked-chip').textContent = hud.ranked ? 'RANKED' : 'PRACTICE'
    this.q('.ranked-chip').classList.toggle('is-practice', !hud.ranked)
    const best = this.save.data.trackBests[hud.track.id]
    this.setText('hud-best-lap', best?.bestLapMs ? formatShortTime(best.bestLapMs) : '—')
    if (this.lastMinimapTrack !== hud.track.id) {
      this.lastMinimapTrack = hud.track.id
      this.buildHudMap(hud.track)
    }
    this.updateHudDot(hud.track, hud.progress)
    if (hud.mode === 'countdown') {
      const label = hud.countdown
      if (this.countdownShown !== label) {
        this.countdownShown = label
        const count = this.q('.countdown-number')
        count.textContent = label
        count.animate([{ transform: 'scale(1.35)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }], { duration: 230, easing: 'cubic-bezier(.16,1,.3,1)' })
      }
      this.q('.countdown').classList.add('is-visible')
      this.q('.countdown-caption').textContent = 'LIGHTS OUT IN'
    } else {
      this.q('.countdown').classList.remove('is-visible')
      if (this.lastMode === 'countdown' && hud.mode === 'playing') {
        this.goTimer = 0.75
        this.q('.go-flash').classList.add('is-visible')
      }
    }
    if (hud.mode === 'playing' || hud.mode === 'countdown' || hud.mode === 'ended') this.lastMode = hud.mode
    this.q('.air-state').classList.toggle('is-visible', hud.airborne)
    this.q('.wall-state').classList.toggle('is-visible', hud.wallRiding)
  }

  private buildHudMap(track: TrackDef): void {
    const points = trackMapPoints(track, 96)
    const path = points.map(([x, z], i) => `${i === 0 ? 'M' : 'L'}${(x * 180).toFixed(1)},${(z * 100).toFixed(1)}`).join(' ')
    this.q('.hud-map-svg').innerHTML = `<path d="${path}" fill="none" stroke="rgba(247,241,228,.2)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/><path d="${path}" fill="none" stroke="rgba(247,241,228,.9)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle class="hud-map-dot" cx="0" cy="0" r="4" fill="#ff6b35" stroke="#f7f1e4" stroke-width="2"/>`
    this.q('.hud-map-svg').setAttribute('viewBox', '0 0 180 100')
    this.q('.hud-map').dataset.track = track.id
  }

  private updateHudDot(track: TrackDef, progress: number): void {
    const points = trackMapPoints(track, 96)
    const index = Math.floor(Math.max(0, Math.min(0.999, progress)) * points.length)
    const p = points[index]
    const dot = this.q<SVGCircleElement>('.hud-map-dot')
    dot.setAttribute('cx', (p[0] * 180).toFixed(1))
    dot.setAttribute('cy', (p[1] * 100).toFixed(1))
  }

  private setText(slot: string, text: string): void {
    if (this.lastHud.get(slot) === text) return
    this.lastHud.set(slot, text)
    const el = this.q(`[data-slot="${slot}"]`)
    if (el) el.textContent = text
  }

  showResults(result: { totalMs: number; bestLapMs: number; lapTimesMs: number[]; track: TrackDef; raceBest: boolean; lapBest: boolean }): void {
    this.result = result
    this.q('.results-time').textContent = formatRaceTime(result.totalMs)
    this.q('.results-track').textContent = `${result.track.number}  //  ${result.track.name.toUpperCase()}`
    this.q('.results-best-lap').textContent = formatRaceTime(result.bestLapMs)
    this.q('.results-pb').classList.toggle('is-visible', result.raceBest || result.lapBest)
    this.q('.results-pb').textContent = result.raceBest ? 'NEW TRACK RECORD' : 'NEW BEST LAP'
    this.q('.results-laps').innerHTML = result.lapTimesMs.map((lap, i) => `<div class="results-lap"><span>LAP ${String(i + 1).padStart(2, '0')}</span><b>${formatRaceTime(lap)}</b>${lap === result.bestLapMs ? '<em>FASTEST</em>' : ''}</div>`).join('')
    this.setScoreStatus({ status: 'idle' })
    this.q('.results-confetti').innerHTML = Array.from({ length: 22 }, (_, i) => `<i style="--i:${i};--x:${(i * 37) % 100}%;--r:${(i * 73) % 360}deg;--c:${['#ff6b35', '#7ee0c2', '#ffd45e', '#f7f1e4'][i % 4]}"></i>`).join('')
    this.show('results')
  }

  setScoreStatus(state: { status: ScoreStatus; rank?: number; message?: string; retryable?: boolean }): void {
    const el = this.q('.results-online')
    el.dataset.status = state.status
    if (state.status === 'pending') el.textContent = 'SUBMITTING TO GLOBAL BOARD…'
    else if (state.status === 'success') el.textContent = state.rank ? `GLOBAL BOARD · P${state.rank}` : 'GLOBAL BOARD · TIME ACCEPTED'
    else if (state.status === 'error') el.textContent = `LOCAL PB SAVED · ${(state.message ?? 'ONLINE UNAVAILABLE').replace(/_/g, ' ').toUpperCase()}`
    else if (state.status === 'unranked') el.textContent = 'PRACTICE RUN · TUNING CHANGES ARE NOT RANKED'
    else el.textContent = 'LOCAL RESULT SECURED'
    this.q<HTMLButtonElement>('.retry-score').hidden = state.status !== 'error' || state.retryable === false
  }

  get currentResult(): typeof this.result {
    return this.result
  }

  private template(): string {
    const cards = TRACKS.map(track => `
      <button class="track-card" data-nav data-track-card="${track.id}" style="--accent:${track.accent};--secondary:${track.secondary}">
        <span class="track-card-index">${track.number}</span>
        <span class="track-card-map">${trackSvg(track, 140, 84)}</span>
        <span class="track-card-copy"><b>${esc(track.name)}</b><small>${track.difficulty} · ${FEATURE_LABEL[track.id]}</small></span>
        <span class="track-card-best">—</span>
        <span class="track-card-arrow">${icon.arrow}</span>
      </button>`).join('')
    const boardTabs = TRACKS.map(track => `<button data-nav class="board-tab" data-board-track="${track.id}">${track.shortName.toUpperCase()}</button>`).join('')
    return /* html */ `
<div class="ui-shell">
  <section class="screen screen-boot is-active" data-screen="boot" aria-hidden="false">
    <div class="boot-grid"></div>
    <div class="boot-mark">
      <div class="brand-chevron">${icon.chevron}</div>
      <div class="brand-word"><span>APEX</span><b>OVERDRIVE</b></div>
      <p class="boot-kicker">ORIGINAL ARCADE RACING</p>
      <div class="boot-bar"><i></i></div>
      <div class="boot-row"><span class="boot-label">Warming the tires…</span><span>F1 / 3D</span></div>
      <div class="boot-error"></div>
      <button class="boot-retry btn btn-small" data-action="retry-boot" hidden>RETRY BOOT</button>
    </div>
    <div class="boot-footer"><span>BUILT FOR THE BRAVE</span><span>v1.0</span></div>
  </section>

  <section class="screen screen-title" data-screen="title" aria-hidden="true">
    <div class="title-shade"></div>
    <header class="title-top">
      <div class="brand-mark"><span class="brand-chevron">${icon.chevron}</span><span class="brand-small">APEX<br><b>OVERDRIVE</b></span></div>
      <div class="title-top-right">
        <div class="online-chip" data-status="idle"><i></i><span>LOCAL MODE</span></div>
        <div class="input-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> DRIVE <kbd>SPACE</kbd> DRIFT <kbd>SHIFT</kbd> BOOST</div>
      </div>
    </header>
    <div class="title-copy">
      <div class="title-eyebrow"><span class="title-track-accent"></span><span>ARCADE CIRCUIT RACING</span></div>
      <h1 class="hero-wordmark"><span>APEX</span><em>OVERDRIVE</em></h1>
      <p class="title-tagline">Hold the line. Find the air.</p>
      <div class="selected-track">
        <div class="selected-track-head"><span class="selected-track-number">01</span><div><span class="selected-track-subtitle">SALTWIND DISTRICT</span><h2 class="selected-track-name">Harbor Sprint</h2></div><span class="selected-track-difficulty">ROOKIE</span></div>
        <p class="selected-track-tagline">Hold the line. Find the air.</p>
        <p class="selected-track-desc"></p>
        <div class="selected-track-meta"></div>
        <div class="selected-track-foot"><span class="selected-track-best">NO TIME SET</span><button class="btn btn-primary btn-start" data-nav data-action="start"><span class="start-label">START ENGINE</span>${icon.arrow}</button></div>
      </div>
      <div class="title-actions"><button class="text-button" data-nav data-action="leaderboard">GLOBAL BOARD</button><button class="text-button" data-nav data-action="settings">SETTINGS</button></div>
    </div>
    <aside class="track-rail" aria-label="Choose a circuit">
      <div class="rail-heading"><span>CHOOSE CIRCUIT</span><span>PB</span></div>
      ${cards}
      <div class="rail-tip">SELECT A CIRCUIT · THEN HIT THE THROTTLE</div>
    </aside>
    <footer class="title-footer"><span>APEX OVERDRIVE · AN ORIGINAL ARCADE RACER</span><span>WASD + GAMEPAD + TOUCH</span></footer>
  </section>

  <section class="screen screen-hud" data-screen="hud" aria-hidden="true">
    <div class="speed-lines"></div>
    <div class="hud-frame">
      <div class="hud-top-left">
        <div class="lap-block"><span class="hud-label">LAP</span><b data-slot="lap-current">01</b><i>/ <span data-slot="lap-total">2</span></i></div>
        <div class="track-block"><span class="hud-label">CIRCUIT</span><b data-slot="hud-track">HARBOR SPRINT</b><span class="hud-sub">TWO-LAP SPRINT</span></div>
      </div>
      <div class="hud-timer-block">
        <span class="hud-label">RACE TIME</span><b class="hud-total" data-slot="total-time">0:00.000</b>
        <div class="hud-lap-time"><span>LAP</span><b data-slot="lap-time">0:00.000</b></div>
      </div>
      <div class="hud-top-right">
        <span class="ranked-chip">RANKED</span>
        <button class="hud-pause" data-nav data-action="pause" aria-label="Pause race">${icon.pause}</button>
      </div>
      <div class="hud-map"><div class="hud-map-frame"><svg class="hud-map-svg" viewBox="0 0 180 100"></svg><span class="map-start"></span></div><div class="hud-best"><span>BEST LAP</span><b data-slot="hud-best-lap">—</b></div></div>
      <div class="hud-bottom-left">
        <div class="boost-block"><div class="boost-head"><span>BOOST</span><b><span data-slot="boost-pct">38</span>%</b></div><div class="boost-track"><i class="boost-fill"></i></div><div class="boost-keys"><kbd>SHIFT</kbd> FIRE <span>DRIFT TO CHARGE</span></div></div>
        <div class="air-state">AIRBORNE</div>
        <div class="wall-state">MAGNETIC WALL RIDE</div>
      </div>
      <div class="hud-speed"><div class="speed-readout"><b data-slot="speed">000</b><span>KM/H</span></div><div class="gear-readout"><span data-slot="gear">G1</span><i>ARCADE SPEC</i></div></div>
      <div class="countdown"><span class="countdown-caption">LIGHTS OUT IN</span><b class="countdown-number">3</b></div>
      <div class="go-flash">GO</div>
      <div class="race-banner"></div>
      <div class="touch-controls">
        <div class="touch-steer"><button data-touch-steer="left" aria-label="Steer left">‹</button><button data-touch-steer="right" aria-label="Steer right">›</button></div>
        <div class="touch-pedals"><button data-touch-throttle="1" aria-label="Throttle">GO</button><button data-touch-throttle="-1" aria-label="Brake">BRK</button></div>
        <div class="touch-actions"><button data-touch-action="drift">DRIFT</button><button data-touch-action="boost">BOOST</button></div>
      </div>
    </div>
  </section>

  <section class="screen screen-modal screen-pause" data-screen="pause" aria-hidden="true">
    <div class="modal">
      <div class="modal-kicker">RACE CONTROL</div>
      <h2>PIT STOP</h2>
      <p class="modal-copy">Catch your breath. The clock is waiting.</p>
      <div class="modal-menu"><button data-nav class="btn btn-primary" data-action="resume"><span>BACK ON TRACK</span>${icon.arrow}</button><button data-nav class="btn" data-action="restart"><span>RESTART RACE</span>${icon.arrow}</button><button data-nav class="btn" data-action="settings"><span>SETTINGS</span>${icon.arrow}</button><button data-nav class="btn btn-quiet" data-action="quit"><span>QUIT TO PADDOCK</span></button></div>
      <div class="modal-meta">ESC / START TO RESUME</div>
    </div>
  </section>

  <section class="screen screen-modal screen-settings" data-screen="settings" aria-hidden="true">
    <div class="modal modal-wide">
      <div class="modal-kicker">SYSTEMS</div>
      <h2>SETTINGS</h2>
      <div class="settings-grid">
        <div class="settings-col">
          <h3>AUDIO</h3>
          <label class="setting-row"><span>MUSIC</span><input data-nav type="range" name="musicVolume" min="0" max="1" step="0.05"><b class="music-value">58%</b></label>
          <label class="setting-row"><span>SFX</span><input data-nav type="range" name="sfxVolume" min="0" max="1" step="0.05"><b class="sfx-value">82%</b></label>
          <div class="setting-row"><span>MUTE ALL</span><button class="toggle" data-nav data-setting="muted" aria-pressed="false"><i></i><span>ON</span></button></div>
          <h3>DRIVER</h3>
          <label class="setting-row name-row"><span>NAME</span><input data-nav class="name-input" type="text" name="playerName" maxlength="20" autocomplete="off" spellcheck="false"><b>20 MAX</b></label>
        </div>
        <div class="settings-col">
          <h3>DISPLAY</h3>
          <div class="setting-row"><span>QUALITY</span><div class="seg quality-seg"><button data-nav data-quality="low">LOW</button><button data-nav data-quality="medium">MED</button><button data-nav data-quality="high">HIGH</button></div></div>
          <div class="setting-row"><span>REDUCED MOTION</span><button class="toggle" data-nav data-setting="reducedMotion" aria-pressed="false"><i></i><span>OFF</span></button></div>
          <h3>CONTROLS</h3>
          <div class="control-list"><div><kbd>W</kbd><kbd>S</kbd><span>THROTTLE / BRAKE</span></div><div><kbd>A</kbd><kbd>D</kbd><span>STEER</span></div><div><kbd>SPACE</kbd><span>DRIFT</span></div><div><kbd>SHIFT</kbd><span>BOOST</span></div><div><kbd>ESC</kbd><span>PAUSE</span></div></div>
        </div>
      </div>
      <div class="modal-actions"><button data-nav class="btn" data-action="back"><span>BACK</span>${icon.arrow}</button></div>
    </div>
  </section>

  <section class="screen screen-modal screen-leaderboard" data-screen="leaderboard" aria-hidden="true">
    <div class="modal modal-board">
      <div class="board-heading"><div><div class="modal-kicker">GLOBAL TIMING</div><h2>LEADERBOARD</h2></div><div class="board-tabs">${boardTabs}</div></div>
      <div class="board-track-heading"><span class="board-track-name">Harbor Sprint</span><span class="board-track-sub">01 // SALTWIND DISTRICT // TWO-LAP TIME</span></div>
      <div class="board-status">READING THE GLOBAL TIMING SCREEN…</div>
      <div class="board-columns"><span>POS</span><span>DRIVER</span><span>TIME</span><span>CLASS</span></div>
      <ol class="board-list"></ol>
      <div class="board-note">Guest times are submitted once per completed race. Tuning changes mark a run as practice and keep it off the global board.</div>
      <div class="modal-actions"><button data-nav class="btn" data-action="back"><span>BACK</span>${icon.arrow}</button></div>
    </div>
  </section>

  <section class="screen screen-modal screen-results" data-screen="results" aria-hidden="true">
    <div class="results-confetti"></div>
    <div class="modal modal-results">
      <div class="results-head"><div><div class="modal-kicker">TIMING SCREEN</div><h2>RACE COMPLETE</h2><span class="results-track">01 // HARBOR SPRINT</span></div><div class="results-pb">NEW TRACK RECORD</div></div>
      <div class="results-main"><div class="results-time-label">TOTAL TIME</div><b class="results-time">0:00.000</b><div class="results-best"><span>BEST LAP</span><b class="results-best-lap">0:00.000</b></div></div>
      <div class="results-laps"></div>
      <div class="results-online" data-status="idle">LOCAL RESULT SECURED</div>
      <div class="results-actions"><button data-nav class="btn btn-primary" data-action="restart"><span>RACE AGAIN</span>${icon.arrow}</button><button data-nav class="btn" data-action="leaderboard"><span>LEADERBOARD</span>${icon.arrow}</button><button data-nav class="btn btn-quiet" data-action="quit"><span>PADDOCK</span></button><button class="btn btn-small retry-score" data-nav data-action="retry-score" hidden>RETRY POST</button></div>
    </div>
  </section>
</div>`
  }
}

import './styles/main.css'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, recordBest } from './engine/save'
import { AUDIO_URLS } from './game/assets'
import type { Game } from './game/game'
import type { Renderer } from './engine/renderer'
import type { TrackDef, TrackId } from './game/tracks'
import { tuning } from './game/tuning'
import { Online, type Ticket } from './online/leaderboard'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const root = document.querySelector<HTMLElement>('#ui')!
  let firstRun = false
  try { firstRun = localStorage.getItem(SAVE_KEY) === null } catch { firstRun = true }
  const save = new SaveStore()
  const input = new Input()
  const audio = new Audio()
  const online = new Online()
  let game: Game | undefined
  let renderer: Renderer | undefined
  let loop: GameLoop
  let activeTicket: Promise<Ticket | null> = Promise.resolve(null)
  let submitting = false
  let currentResult: { totalMs: number; bestLapMs: number; lapTimesMs: number[]; track: TrackDef; unranked: boolean } | null = null

  const applySettings = () => {
    audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
    game?.setReducedMotion(save.data.reducedMotion)
  }

  const syncOnlineStatus = () => {
    ui.setOnlineStatus(online.status, online.status === 'ready' ? 'GLOBAL BOARD' : online.status === 'connecting' ? 'CONNECTING' : 'LOCAL MODE')
  }

  const startRace = () => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    online.clearRun()
    game.startRace()
    ui.show('hud')
    loop.resetAccumulator()
    currentResult = null
    submitting = false
    const track = game.selectedTrackId
    if (game.snapshot().ranked) {
      activeTicket = (async () => {
        await online.setName(save.data.playerName)
        syncOnlineStatus()
        const ticket = await online.beginRun(track)
        syncOnlineStatus()
        return ticket
      })().catch(error => {
        console.warn('Online run ticket unavailable; the race will remain local.', error)
        online.status = 'offline'
        syncOnlineStatus()
        return null
      })
    } else {
      activeTicket = Promise.resolve(null)
    }
  }

  const submitResult = async () => {
    if (!game || !currentResult || submitting) return
    if (currentResult.unranked) {
      ui.setScoreStatus({ status: 'unranked' })
      return
    }
    submitting = true
    ui.setScoreStatus({ status: 'pending' })
    try {
      const ticket = await activeTicket
      if (!ticket) throw Object.assign(new Error('online_unavailable'), { code: 'online_unavailable' })
      const outcome = await online.submit(currentResult.track.id, currentResult.totalMs)
      ui.setScoreStatus({ status: 'success', rank: outcome.rank })
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'online_unavailable'
      const status = (error as { status?: number }).status ?? 0
      const retryable = online.hasTicket && (code === 'network_unavailable' || code === 'rate_limited' || status >= 500)
      const message = code === 'score_outside_rules' ? 'global time not accepted' : code === 'online_unavailable' || code === 'no_active_run_ticket' ? 'global post unavailable' : code
      ui.setScoreStatus({ status: 'error', message, retryable })
    } finally {
      submitting = false
    }
  }

  const ui = new Ui(root, save, audio, input, {
    selectTrack: (id: TrackId) => {
      save.update({ lastTrack: id })
      game?.selectTrack(id)
      ui.setSelectedTrack(id)
    },
    start: startRace,
    restart: startRace,
    resume: () => {
      if (!game || game.mode !== 'paused') return
      game.resume()
      ui.show('hud')
      loop.resetAccumulator()
    },
    pause: () => {
      if (!game || (game.mode !== 'playing' && game.mode !== 'countdown')) return
      game.pause()
      ui.show('pause')
      loop.resetAccumulator()
    },
    quit: () => {
      online.clearRun()
      game?.toTitle()
      if (game) ui.setSelectedTrack(game.selectedTrackId)
      ui.show('title')
      ui.refreshAll()
      loop.resetAccumulator()
    },
    settings: patch => {
      const previousQuality = save.data.quality
      const cleanPatch = { ...patch }
      if (typeof cleanPatch.playerName === 'string') {
        cleanPatch.playerName = [...cleanPatch.playerName.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, 20).join('') || 'APEX DRIVER'
      }
      save.update(cleanPatch)
      applySettings()
      if (previousQuality !== save.data.quality) {
        const quality = save.data.quality
        renderer?.applyQuality(quality)
        game?.setQuality(quality)
      }
      ui.refreshAll()
    },
    leaderboard: track => {
      ui.setBoard({ entries: [], loading: true })
      void online.list(track).then(board => ui.setBoard(board))
    },
    retryScore: () => { void submitResult() },
  })
  ui.show('boot')
  applySettings()
  ui.setOnlineStatus('connecting')

  try {
    const [{ Game: GameClass }, { Renderer, suggestQuality }] = await Promise.all([
      import('./game/game'),
      import('./engine/renderer'),
    ])
    if (firstRun) {
      save.update({ quality: suggestQuality() })
      ui.refreshSettings()
    }
    ui.setBootProgress(0.08, 'Building the circuit…')
    renderer = new Renderer(canvas, save.data.quality)
    game = new GameClass(renderer, input, audio, {
      banner: (text, tone) => ui.banner(text, tone),
      finished: (result, track) => {
        const record = recordBest(save.data, track.id, result.totalMs, result.bestLapMs)
        save.update({ trackBests: record.data.trackBests })
        currentResult = { totalMs: result.totalMs, bestLapMs: result.bestLapMs, lapTimesMs: result.lapTimesMs, track, unranked: result.unranked }
        ui.showResults({ ...currentResult, raceBest: record.raceBest, lapBest: record.lapBest })
        void submitResult()
      },
    }, save.data.lastTrack, save.data.quality)
    game.setReducedMotion(save.data.reducedMotion)
    ui.setSelectedTrack(game.selectedTrackId)

    let modelProgress = 0
    let audioProgress = 0
    const updateBoot = (label?: string) => {
      ui.setBootProgress(0.12 + modelProgress * 0.55 + audioProgress * 0.28, label ?? (modelProgress < 1 ? 'Detailing the hero car…' : 'Tuning the race audio…'))
    }
    updateBoot('Detailing the hero car…')
    const [, audioErrors] = await Promise.all([
      game.loadHeroCar((fraction, label) => {
        modelProgress = fraction
        updateBoot(label)
      }),
      audio.loadAll(AUDIO_URLS, (fraction, label) => {
        audioProgress = fraction
        updateBoot(label)
      }),
      document.fonts.ready,
    ])
    if (audioErrors.length) console.warn('Some race audio failed to load.', audioErrors)
    if (game.loadError) console.warn('Hero car fallback active:', game.loadError)
    ui.setBootProgress(1, 'Ready to race.')
    await new Promise(resolve => window.setTimeout(resolve, 180))
    ui.show('title')
    ui.refreshAll()
    syncOnlineStatus()
    void online.init(save.data.playerName).then(() => syncOnlineStatus())

    const g = game
    loop = new GameLoop({
      beforeFrame: () => input.update(),
      step: dt => g.step(dt),
      render: (alpha, frameSeconds) => {
        ui.frame(frameSeconds)
        if (input.consume('pause')) {
          if (g.mode === 'playing' || g.mode === 'countdown') {
            g.pause()
            ui.show('pause')
            loop.resetAccumulator()
          } else if (g.mode === 'paused' && ui.screen === 'pause') {
            g.resume()
            ui.show('hud')
            loop.resetAccumulator()
          }
        }
        g.render(alpha, frameSeconds)
        if (g.mode === 'playing' || g.mode === 'countdown' || g.mode === 'ended') ui.updateHud(g.snapshot())
        loop.paused = g.mode !== 'playing' && g.mode !== 'countdown'
      },
    })
    loop.start()

    const unlockAudio = () => {
      audio.unlock()
      audio.startMusic()
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && g.mode === 'playing') {
        g.pause()
        ui.show('pause')
        loop.resetAccumulator()
      }
    })
    new TouchControls(root, input, () => g.mode === 'playing' || g.mode === 'countdown')

    const debug = { game: g, ui, input, save, online, audio, tuning, renderer }
    ;(window as unknown as { __game: unknown }).__game = debug
    ;(window as unknown as { __apex: unknown }).__apex = debug
  } catch (error) {
    console.error(error)
    ui.setBootError(`The race could not start: ${String((error as Error)?.message ?? error).replace(/[<>&]/g, '')}`)
  }
}

boot().catch(error => {
  console.error(error)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((error as Error)?.message ?? error).replace(/[<>&]/g, '')}</div>`
})

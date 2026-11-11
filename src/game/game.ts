import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import { CAR_URL } from './assets'
import { CameraRig } from './camera'
import { Car } from './car'
import { CarVisual } from './car-model'
import { CONFIG } from './config'
import { Effects } from './fx'
import { createRace, crossFinishLine, raceResult, tickRace, type RaceResult, type RaceState } from './rules'
import { TRACK_BY_ID, TRACKS, TrackModel, type TrackDef, type TrackId } from './tracks'
import { tuning } from './tuning'
import { TrackWorld } from './world'

export type GameMode = 'title' | 'countdown' | 'playing' | 'paused' | 'ended'
export type BannerTone = 'info' | 'jump' | 'boost' | 'wall' | 'lap' | 'warn' | 'finish'
export type GameHooks = {
  banner: (text: string, tone: BannerTone) => void
  finished: (result: RaceResult, track: TrackDef) => void
}

export type HudSnapshot = {
  mode: GameMode
  track: TrackDef
  race: RaceState | null
  speedKph: number
  gear: number
  boost: number
  drifting: boolean
  wallRiding: boolean
  airborne: boolean
  lapTimeMs: number
  progress: number
  countdown: string
  ranked: boolean
}

/** Owns the scene, current circuit, car, camera and race lifecycle. */
export class Game {
  readonly scene = new THREE.Scene()
  readonly camera: CameraRig
  readonly car = new Car()
  readonly visual = new CarVisual()
  readonly effects = new Effects()
  readonly tracks = TRACKS
  mode: GameMode = 'title'
  selectedTrackId: TrackId
  race: RaceState | null = null
  reducedMotion = false
  private world!: TrackWorld
  private model!: TrackModel
  private pausedFrom: GameMode = 'playing'
  private audioClock = 0
  private bannerClock = 0
  private lastBanner = ''
  private modelLoadError: string | null = null

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
    initialTrack: TrackId = 'harbor',
    private quality: 'low' | 'medium' | 'high' = 'high',
  ) {
    this.camera = new CameraRig(window.innerWidth / window.innerHeight)
    this.selectedTrackId = initialTrack
    this.scene.add(this.car.root, this.effects.group, this.visual.shadow)
    this.car.root.add(this.visual.root)
    this.buildWorld(initialTrack)
    this.toTitle()
  }

  async loadHeroCar(onProgress?: (fraction: number, label: string) => void): Promise<void> {
    try {
      await this.visual.load(CAR_URL, onProgress)
    } catch (error) {
      this.modelLoadError = String((error as Error)?.message ?? error)
      console.warn('Hero car delivery unavailable, using the original procedural car.', error)
      this.visual.useFallback()
    }
  }

  get loadError(): string | null {
    return this.modelLoadError
  }

  get track(): TrackDef {
    return TRACK_BY_ID[this.selectedTrackId]
  }

  get trackModel(): TrackModel {
    return this.model
  }

  get trackWorld(): TrackWorld {
    return this.world
  }

  get carVisual(): CarVisual {
    return this.visual
  }

  private buildWorld(id: TrackId): void {
    this.world?.dispose()
    const def = TRACK_BY_ID[id]
    this.selectedTrackId = id
    this.model = new TrackModel(def, 900)
    this.world = new TrackWorld(this.scene, def, this.model, this.quality, this.reducedMotion)
    this.car.reset(this.model, 0.055, 0)
    this.effects.clear()
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.quality = quality
    const preserve = this.mode === 'playing' || this.mode === 'paused' || this.mode === 'ended'
    const t = this.car.t
    const lateral = this.car.lateral
    const speed = this.car.speed
    this.buildWorld(this.selectedTrackId)
    this.car.reset(this.model, preserve ? t : 0.055, preserve ? lateral : 0)
    if (preserve) this.car.speed = speed
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value
    this.camera.setReducedMotion(value)
    this.effects.setReducedMotion(value)
  }

  selectTrack(id: TrackId): void {
    if (this.mode !== 'title' && this.mode !== 'ended') return
    if (id === this.selectedTrackId) return
    this.buildWorld(id)
    this.mode = 'title'
    this.race = null
    this.audio.stopRaceLoops()
  }

  startRace(): void {
    tuning.activate('run')
    this.car.reset(this.model, 0.025, 0)
    this.effects.clear()
    this.race = createRace(this.track.laps, CONFIG.run.countdown, tuning.unranked)
    this.mode = 'countdown'
    this.audio.stopRaceLoops()
    this.audio.unlock()
    this.audio.startMusic()
    this.audio.play('start', { volume: 0.9 })
    this.bannerClock = 0
    this.hooks.banner('HOLD THE LINE', 'info')
  }

  pause(): void {
    if (this.mode !== 'playing' && this.mode !== 'countdown') return
    this.pausedFrom = this.mode
    this.mode = 'paused'
    this.audio.duckMusic(0.18)
    this.audio.setEngine(0, 0, false)
    this.audio.stopLoop('drift')
    this.audio.stopLoop('wallride')
  }

  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = this.pausedFrom
    this.audio.unduckMusic()
  }

  toTitle(): void {
    this.mode = 'title'
    this.race = null
    this.car.reset(this.model, 0.055, 0)
    this.effects.clear()
    this.audio.stopRaceLoops()
    this.audio.unduckMusic()
  }

  private showBanner(text: string, tone: BannerTone, cooldown = 0.7): void {
    if (this.bannerClock > 0 && this.lastBanner === text) return
    this.lastBanner = text
    this.bannerClock = cooldown
    this.hooks.banner(text, tone)
  }

  private handleEvents(events: ReturnType<Car['step']>): void {
    for (const event of events) {
      if (event.type === 'jump') {
        this.audio.play('jump', { volume: 0.8, rate: 0.92 + (event.intensity ?? 0.5) * 0.18 })
        this.camera.impact(0.18)
        this.showBanner((event.intensity ?? 0) > 0.65 ? 'BIG AIR' : 'JUMP', 'jump', 1)
      } else if (event.type === 'land') {
        this.audio.play('land', { volume: 0.75 + (event.intensity ?? 0.5) * 0.35, rate: 0.92 })
        this.camera.impact(0.22 + (event.intensity ?? 0.5) * 0.35)
        this.effects.burst(this.car, this.model, 'land')
      } else if (event.type === 'airBoost') {
        this.audio.play('boost', { volume: 0.72, rate: 1.08 })
        this.showBanner('AIR BOOST', 'boost', 1)
      } else if (event.type === 'boost') {
        this.audio.play('boost', { volume: 0.8 })
        this.camera.impact(0.12)
        this.showBanner('BOOST', 'boost', 0.8)
      } else if (event.type === 'collision') {
        this.audio.play('land', { volume: 1, rate: 0.68 })
        this.camera.impact(0.55 + (event.intensity ?? 0.5) * 0.4)
        this.effects.burst(this.car, this.model, 'collision')
        this.showBanner('BARRIER!', 'warn', 0.8)
      } else if (event.type === 'wallRide') {
        this.audio.setLoop('wallride', 0.36, 1)
        this.showBanner('WALL RIDE', 'wall', 2)
      } else if (event.type === 'wallRideEnd') {
        this.audio.stopLoop('wallride')
        this.showBanner('WALL RIDE CLEAR', 'wall', 1.2)
      }
    }
  }

  step(dt: number): void {
    this.bannerClock = Math.max(0, this.bannerClock - dt)
    if (this.mode === 'countdown' && this.race) {
      const next = tickRace(this.race, dt)
      this.race = next
      if (next.phase === 'racing') {
        this.mode = 'playing'
        this.audio.setEngine(0, 0, true)
      }
      return
    }
    if (this.mode !== 'playing' || !this.race) return
    const beforeTick = this.race
    this.race = tickRace(beforeTick, dt)
    const throttle = this.input.move.y
    const steer = this.input.move.x
    const controls = { throttle, steer, drift: this.input.held('drift'), boost: this.input.held('boost') }
    const prev = this.car.t
    const events = this.car.step(dt, controls, this.model)
    this.handleEvents(events)
    const crossed = prev > 0.72 && this.car.t < 0.28 && this.car.speed > 0
    if (crossed && this.race.phase === 'racing') {
      const crossing = crossFinishLine(this.race)
      this.race = crossing.state
      if (crossing.completedLap !== null) {
        if (crossing.finished) {
          this.finishRace()
          return
        }
        this.audio.play('lap', { volume: 0.9 })
        this.showBanner(`LAP ${crossing.completedLap} CLEAR`, 'lap', 1.6)
      }
    }
    this.audioClock -= dt
    if (this.audioClock <= 0) {
      this.audioClock = 0.09
      const maxSpeed = CONFIG.car.maxSpeed * this.track.speedModifier
      this.audio.setEngine(Math.abs(this.car.speed) / Math.max(1, maxSpeed), throttle, true)
      this.audio.setLoop('drift', this.car.isDrifting ? 0.24 : 0, 0.9 + this.car.drift * 0.15)
      if (this.car.wallRiding) this.audio.setLoop('wallride', 0.34, 1.02)
      if (this.car.isDrifting) this.effects.drift(this.car, this.model)
      if (this.car.boostTimer > 0) this.effects.boost(this.car)
    }
  }

  private finishRace(): void {
    if (!this.race) return
    this.mode = 'ended'
    this.audio.stopRaceLoops()
    this.audio.play('finish', { volume: 0.95 })
    this.audio.duckMusic(0.72)
    this.effects.burst(this.car, this.model, 'finish')
    this.camera.impact(0.35)
    this.showBanner('FINISH', 'finish', 3)
    this.hooks.finished(raceResult(this.race, this.selectedTrackId), this.track)
  }

  render(_alpha: number, frameSeconds: number): void {
    this.world.update(frameSeconds)
    this.effects.update(frameSeconds)
    this.visual.animate(frameSeconds, this.car.speed, this.car.boostTimer, this.car.drift)
    const surface = this.car.surfacePoint(this.model)
    this.visual.shadow.position.copy(surface).addScaledVector(this.model.sample(this.car.t).normal, 0.035)
    this.visual.shadow.quaternion.copy(this.model.pose(this.car.t, this.car.lateral, 0.04).quaternion)
    const gap = this.car.airborne ? Math.max(0, this.car.airY - surface.y) : 0
    const scale = Math.max(0.42, 1 - gap * 0.045)
    this.visual.shadow.scale.setScalar(scale)
    ;(this.visual.shadow.material as THREE.MeshBasicMaterial).opacity = 0.28 * Math.max(0.2, scale)
    if (this.mode === 'title') this.camera.showcase(this.car, this.model, frameSeconds)
    else if (this.mode !== 'paused') this.camera.chase(this.car, this.model, frameSeconds)
    this.camera.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera.camera)
    this.input.endFrame()
  }

  snapshot(): HudSnapshot {
    const race = this.race
    const lapTimeMs = race && race.phase === 'racing' ? Math.max(0, race.elapsedMs - race.lapStartedMs) : 0
    return {
      mode: this.mode,
      track: this.track,
      race,
      speedKph: Math.round(Math.abs(this.car.speed) * 3.6),
      gear: this.car.speed < 0.5 ? 1 : Math.min(8, Math.floor(this.car.speed / 7) + 1),
      boost: this.car.boostMeter,
      drifting: this.car.isDrifting,
      wallRiding: this.car.wallRiding,
      airborne: this.car.airborne,
      lapTimeMs,
      progress: this.car.t,
      countdown: race ? (race.phase === 'countdown' ? String(Math.max(1, Math.ceil(race.countdown))) : 'GO') : '',
      ranked: !tuning.unranked,
    }
  }

  /** Test/debug hook: move the simulated car without exposing simulation internals. */
  debugSetCar(t: number, lateral = 0, speed = 0): void {
    this.car.reset(this.model, t, lateral)
    this.car.speed = speed
  }
}

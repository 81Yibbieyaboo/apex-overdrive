export type SfxName = 'ui' | 'start' | 'boost' | 'jump' | 'land' | 'lap' | 'finish'
export type LoopName = 'engine' | 'drift' | 'wallride'
export type AudioKey = SfxName | LoopName | 'music'

type LoopHandle = { source: AudioBufferSourceNode; gain: GainNode }

/**
 * Web Audio mixer for the generated Apex Overdrive soundtrack and race cues. All media is loaded
 * into buffers once, then reused by short one-shots and smooth speed-reactive loops.
 */
export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private musicBus: GainNode
  private sfxBus: GainNode
  private buffers = new Map<string, AudioBuffer>()
  private loops = new Map<LoopName, LoopHandle>()
  private music?: LoopHandle
  private musicWanted = false
  private musicVolume = 0.58
  private sfxVolume = 0.82

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.musicBus = this.ctx.createGain()
    this.sfxBus = this.ctx.createGain()
    this.musicBus.connect(this.master)
    this.sfxBus.connect(this.master)
    this.master.connect(this.ctx.destination)
    this.setVolumes(0.58, 0.82, false)
  }

  get ready(): boolean {
    return this.ctx.state === 'running'
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.musicWanted && !this.music) this.startMusic()
  }

  setVolumes(music: number, sfx: number, muted = false): void {
    this.musicVolume = Math.max(0, Math.min(1, music))
    this.sfxVolume = Math.max(0, Math.min(1, sfx))
    const t = this.ctx.currentTime
    this.musicBus.gain.setTargetAtTime(muted ? 0 : this.musicVolume * 0.5, t, 0.08)
    this.sfxBus.gain.setTargetAtTime(muted ? 0 : this.sfxVolume * 0.9, t, 0.06)
  }

  async loadAll(urls: Record<string, string>, onProgress?: (fraction: number, label: string) => void): Promise<string[]> {
    const entries = Object.entries(urls)
    const errors: string[] = []
    let complete = 0
    const loadOne = async ([name, url]: [string, string]) => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`${response.status}`)
        const data = await response.arrayBuffer()
        const buffer = await this.ctx.decodeAudioData(data)
        this.buffers.set(name, buffer)
      } catch (error) {
        errors.push(`${name}: ${(error as Error).message}`)
      } finally {
        complete += 1
        onProgress?.(complete / entries.length, `Tuning the race audio ${complete}/${entries.length}`)
      }
    }
    // Decode a few at a time so the boot bar moves without flooding the audio thread.
    const queue = [...entries]
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift()
        if (item) await loadOne(item)
      }
    })
    await Promise.all(workers)
    return errors
  }

  private source(name: AudioKey, bus: GainNode, loop = false): AudioBufferSourceNode | null {
    const buffer = this.buffers.get(name)
    if (!buffer) return null
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.connect(bus)
    return src
  }

  play(name: SfxName, options: { volume?: number; rate?: number; pan?: number } = {}): void {
    if (this.ctx.state !== 'running') return
    const buffer = this.buffers.get(name)
    if (!buffer) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = Math.max(0.55, Math.min(1.8, options.rate ?? 1))
    const gain = this.ctx.createGain()
    gain.gain.value = Math.max(0, Math.min(2, options.volume ?? 1))
    src.connect(gain)
    if (options.pan !== undefined && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, options.pan))
      gain.connect(panner).connect(this.sfxBus)
    } else {
      gain.connect(this.sfxBus)
    }
    src.start()
    src.stop(this.ctx.currentTime + buffer.duration / src.playbackRate.value + 0.05)
  }

  private ensureLoop(name: LoopName): LoopHandle | null {
    const existing = this.loops.get(name)
    if (existing) return existing
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    const source = this.source(name, gain, true)
    if (!source) return null
    gain.connect(this.sfxBus)
    source.start()
    const handle = { source, gain }
    this.loops.set(name, handle)
    return handle
  }

  setLoop(name: LoopName, volume: number, rate = 1): void {
    const handle = this.ensureLoop(name)
    if (!handle) return
    const t = this.ctx.currentTime
    handle.gain.gain.setTargetAtTime(Math.max(0, Math.min(1.4, volume)), t, 0.09)
    handle.source.playbackRate.setTargetAtTime(Math.max(0.55, Math.min(1.7, rate)), t, 0.08)
  }

  stopLoop(name: LoopName, fade = 0.16): void {
    const handle = this.loops.get(name)
    if (!handle) return
    const t = this.ctx.currentTime
    handle.gain.gain.setTargetAtTime(0, t, fade / 3)
    window.setTimeout(() => {
      try { handle.source.stop() } catch { /* already stopped */ }
      this.loops.delete(name)
    }, fade * 1000 + 80)
  }

  setEngine(speedK: number, throttle: number, active: boolean): void {
    if (!active) return this.setLoop('engine', 0, 0.8)
    const k = Math.max(0, Math.min(1, speedK))
    this.setLoop('engine', 0.09 + k * 0.2 + Math.max(0, throttle) * 0.035, 0.7 + k * 0.68)
  }

  startMusic(): void {
    this.musicWanted = true
    if (this.music || this.ctx.state !== 'running') return
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    const source = this.source('music', gain, true)
    if (!source) return
    gain.connect(this.musicBus)
    source.start()
    gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.6)
    this.music = { source, gain }
  }

  stopMusic(fade = 0.5): void {
    this.musicWanted = false
    if (!this.music) return
    const handle = this.music
    handle.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3)
    window.setTimeout(() => {
      try { handle.source.stop() } catch { /* already stopped */ }
    }, fade * 1000 + 100)
    this.music = undefined
  }

  duckMusic(amount = 0.35): void {
    if (!this.music) return
    this.music.gain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.35)
  }

  unduckMusic(): void {
    if (!this.music) return
    this.music.gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.5)
  }

  stopRaceLoops(): void {
    this.stopLoop('engine')
    this.stopLoop('drift')
    this.stopLoop('wallride')
  }
}

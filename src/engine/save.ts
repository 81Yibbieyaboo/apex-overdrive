import type { TrackId } from '../game/tracks'

export type Quality = 'low' | 'medium' | 'high'

export type TrackBest = {
  raceMs: number
  bestLapMs: number
  updatedAt: number
}

export type SaveData = {
  version: 2
  musicVolume: number
  sfxVolume: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  playerName: string
  lastTrack: TrackId
  trackBests: Partial<Record<TrackId, TrackBest>>
}

export const SAVE_KEY = 'apex-overdrive.save.v2'

export function defaultSave(): SaveData {
  return {
    version: 2,
    musicVolume: 0.58,
    sfxVolume: 0.82,
    muted: false,
    quality: 'high',
    reducedMotion: false,
    playerName: 'APEX DRIVER',
    lastTrack: 'harbor',
    trackBests: {},
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const isTrackId = (v: unknown): v is TrackId => v === 'harbor' || v === 'canyon' || v === 'vault'

function cleanBest(value: unknown): TrackBest | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const raceMs = typeof v.raceMs === 'number' && Number.isFinite(v.raceMs) && v.raceMs > 0 ? Math.round(v.raceMs) : 0
  const bestLapMs = typeof v.bestLapMs === 'number' && Number.isFinite(v.bestLapMs) && v.bestLapMs > 0 ? Math.round(v.bestLapMs) : 0
  if (!raceMs) return undefined
  return {
    raceMs,
    bestLapMs,
    updatedAt: typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : 0,
  }
}

/** Parse both the old starter save and the Apex Overdrive v2 record without throwing. */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch {
    return base
  }
  if (data.version !== 1 && data.version !== 2) return base
  const trackBests: Partial<Record<TrackId, TrackBest>> = {}
  if (data.trackBests && typeof data.trackBests === 'object' && !Array.isArray(data.trackBests)) {
    for (const [key, value] of Object.entries(data.trackBests as Record<string, unknown>)) {
      if (!isTrackId(key)) continue
      const best = cleanBest(value)
      if (best) trackBests[key] = best
    }
  }
  const quality = data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality
  const playerName = typeof data.playerName === 'string' && data.playerName.trim()
    ? data.playerName.trim().replace(/[<>]/g, '').slice(0, 20)
    : base.playerName
  return {
    version: 2,
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    quality,
    reducedMotion: data.reducedMotion === true,
    playerName,
    lastTrack: isTrackId(data.lastTrack) ? data.lastTrack : base.lastTrack,
    trackBests,
  }
}

export class SaveStore {
  data: SaveData
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
      if (raw === null) raw = this.storage?.getItem('game3d.save') ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw)
  }
  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch, version: 2 }
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // Private browsing or quota: keep the in-memory settings and records.
    }
  }
}

export function recordBest(save: SaveData, trackId: TrackId, raceMs: number, bestLapMs: number): { data: SaveData; raceBest: boolean; lapBest: boolean } {
  const previous = save.trackBests[trackId]
  const raceBest = !previous || raceMs < previous.raceMs
  const lapBest = !previous || bestLapMs < previous.bestLapMs
  const next: TrackBest = {
    raceMs: raceBest ? raceMs : previous.raceMs,
    bestLapMs: lapBest ? bestLapMs : previous.bestLapMs,
    updatedAt: Date.now(),
  }
  return { data: { ...save, trackBests: { ...save.trackBests, [trackId]: next } }, raceBest, lapBest }
}

import { describe, expect, it } from 'vitest'
import { defaultSave, parseSave, recordBest } from '../src/engine/save'

describe('local records', () => {
  it('returns safe defaults for malformed storage', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('{bad json')).toEqual(defaultSave())
    expect(parseSave(JSON.stringify({ version: 99 }))).toEqual(defaultSave())
  })

  it('sanitizes and restores saved settings and records', () => {
    const parsed = parseSave(JSON.stringify({
      version: 2,
      musicVolume: 2,
      sfxVolume: -1,
      quality: 'medium',
      playerName: '  <Ace> Racer  ',
      lastTrack: 'vault',
      trackBests: { vault: { raceMs: 92_000, bestLapMs: 44_000, updatedAt: 1 }, bad: { raceMs: 1 } },
    }))
    expect(parsed.musicVolume).toBe(1)
    expect(parsed.sfxVolume).toBe(0)
    expect(parsed.playerName).toBe('Ace Racer')
    expect(parsed.lastTrack).toBe('vault')
    expect(parsed.trackBests.vault?.raceMs).toBe(92_000)
    expect(parsed.trackBests).not.toHaveProperty('bad')
  })

  it('only lowers the stored race and lap records', () => {
    const base = defaultSave()
    const first = recordBest(base, 'harbor', 100_000, 49_000)
    expect(first.raceBest).toBe(true)
    expect(first.lapBest).toBe(true)
    const slower = recordBest(first.data, 'harbor', 110_000, 51_000)
    expect(slower.raceBest).toBe(false)
    expect(slower.lapBest).toBe(false)
    expect(slower.data.trackBests.harbor?.raceMs).toBe(100_000)
    const fasterLap = recordBest(slower.data, 'harbor', 110_000, 47_000)
    expect(fasterLap.lapBest).toBe(true)
    expect(fasterLap.data.trackBests.harbor?.bestLapMs).toBe(47_000)
  })
})

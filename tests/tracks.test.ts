import { describe, expect, it } from 'vitest'
import { TRACKS, TrackModel, bankAngleAt, launchPoints, trackMapPoints, wallRideAt } from '../src/game/tracks'

describe('circuits', () => {
  it('provides three distinct lap circuits with ramps', () => {
    expect(TRACKS).toHaveLength(3)
    const lengths = TRACKS.map(track => new TrackModel(track, 300).length)
    expect(new Set(lengths.map(length => Math.round(length))).size).toBe(3)
    for (const track of TRACKS) {
      expect(track.points.length).toBeGreaterThanOrEqual(10)
      expect(track.ramps.length).toBeGreaterThanOrEqual(2)
      expect(launchPoints(track)).toHaveLength(track.ramps.length)
      expect(track.laps).toBe(2)
    }
  })

  it('dedicates a steep banked wall-ride section to Vault Ring', () => {
    const vault = TRACKS.find(track => track.id === 'vault')!
    expect(wallRideAt(vault, 0.4)).toBe(true)
    expect(bankAngleAt(vault, 0.4)).toBeGreaterThan(1.2)
    expect(wallRideAt(vault, 0.2)).toBe(false)
    for (const track of TRACKS.filter(track => track.id !== 'vault')) expect(wallRideAt(track, 0.4)).toBe(false)
  })

  it('normalizes minimaps without clipping and keeps their silhouettes different', () => {
    const maps = TRACKS.map(track => trackMapPoints(track, 72))
    for (const points of maps) {
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(1)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1)
      }
    }
    const signatures = maps.map(points => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('|'))
    expect(new Set(signatures).size).toBe(3)
  })

  it('keeps a continuous frame along the banked surface', () => {
    const model = new TrackModel(TRACKS[2], 300)
    for (let i = 0; i < 30; i += 1) {
      const pose = model.pose(i / 30, 2)
      expect(pose.pos.toArray().every(Number.isFinite)).toBe(true)
      expect(Math.abs(pose.quaternion.length() - 1)).toBeLessThan(1e-4)
    }
  })
})

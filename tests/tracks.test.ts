import { describe, expect, it } from 'vitest'
import { TRACKS, TrackModel, bankAngleAt, launchPoints, trackMapPoints, wallRideAt } from '../src/game/tracks'

describe('circuits', () => {
  it('provides three distinct lap circuits with ramps', () => {
    expect(TRACKS).toHaveLength(3)
    const lengths = TRACKS.map(track => new TrackModel(track, 300).length)
    expect(lengths.every(length => length > 430)).toBe(true)
    expect(new Set(lengths.map(length => length.toFixed(1))).size).toBe(3)
    for (const track of TRACKS) {
      expect(track.points.length).toBeGreaterThanOrEqual(10)
      expect(track.ramps.length).toBeGreaterThanOrEqual(2)
      expect(launchPoints(track)).toHaveLength(track.ramps.length)
      expect(track.laps).toBe(2)
    }
  })

  it('gives every circuit a readable banked wall-ride section', () => {
    for (const track of TRACKS) {
      expect(track.wallRide).toBeDefined()
      const midpoint = (track.wallRide!.from + track.wallRide!.to) / 2
      expect(wallRideAt(track, midpoint)).toBe(true)
      expect(bankAngleAt(track, midpoint)).toBeGreaterThan(1.1)
    }
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

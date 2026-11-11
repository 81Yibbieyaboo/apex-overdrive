import { describe, expect, it } from 'vitest'
import { Car } from '../src/game/car'
import { CONFIG, CAR_HALF_WIDTH } from '../src/game/config'
import { TRACKS, TrackModel } from '../src/game/tracks'

const controls = { throttle: 1, steer: 0, drift: false, boost: false }

describe('arcade car', () => {
  it('accelerates under throttle and advances along the circuit', () => {
    const track = new TrackModel(TRACKS[0], 600)
    const car = new Car()
    car.reset(track, 0.04, 0)
    for (let i = 0; i < 120; i += 1) car.step(1 / 60, controls, track)
    expect(car.speed).toBeGreaterThan(18)
    expect(car.t).toBeGreaterThan(0.04)
    expect(Number.isFinite(car.root.position.x)).toBe(true)
  })

  it('launches from a ramp and grants a landing boost', () => {
    const track = new TrackModel(TRACKS[1], 900)
    const car = new Car()
    const launch = track.launches[0]
    car.reset(track, (launch - 0.0015 + 1) % 1, 0)
    car.speed = 44
    let sawJump = false
    let sawLandingBoost = false
    for (let i = 0; i < 420; i += 1) {
      const events = car.step(1 / 60, controls, track)
      if (events.some(event => event.type === 'jump')) sawJump = true
      if (events.some(event => event.type === 'airBoost')) sawLandingBoost = true
      if (sawLandingBoost) break
    }
    expect(sawJump).toBe(true)
    expect(sawLandingBoost).toBe(true)
    expect(car.airborne).toBe(false)
  })

  it('holds the car to the Vault Ring wall ride', () => {
    const track = new TrackModel(TRACKS[2], 600)
    const car = new Car()
    car.reset(track, 0.4, 0)
    car.speed = 36
    car.step(1 / 60, controls, track)
    expect(car.wallRiding).toBe(true)
    expect(track.sample(car.t).bank).toBeGreaterThan(1.2)
  })

  it('does not drain all speed from continuous barrier contact', () => {
    const track = new TrackModel(TRACKS[0], 600)
    const car = new Car()
    const edge = track.def.width / 2 - CAR_HALF_WIDTH - 0.25
    car.reset(track, 0.05, edge - 0.01)
    car.speed = 40
    car.lateralVel = 20
    for (let i = 0; i < 30; i += 1) car.step(1 / 60, { ...controls, steer: 1 }, track)
    expect(car.speed).toBeGreaterThan(12)
    expect(car.speed).toBeLessThanOrEqual(CONFIG.car.maxSpeed * track.def.speedModifier + 0.01)
  })
})

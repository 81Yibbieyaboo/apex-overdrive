import { describe, expect, it } from 'vitest'
import { keyboardSteer } from '../src/engine/input'
import { countdownLabel, createRace, crossFinishLine, formatRaceTime, formatShortTime, raceResult, tickRace } from '../src/game/rules'

describe('race rules', () => {
  it('runs the countdown, times laps, and freezes the final result', () => {
    let race = createRace(2, 3)
    expect(race.phase).toBe('countdown')
    race = tickRace(race, 2)
    expect(race.countdown).toBeCloseTo(1)
    race = tickRace(race, 1)
    expect(race.phase).toBe('racing')
    expect(race.elapsedMs).toBe(0)
    race = tickRace(race, 1)
    let finish = crossFinishLine(race)
    expect(finish.finished).toBe(false)
    expect(finish.state.lap).toBe(2)
    expect(finish.state.lapTimesMs).toHaveLength(1)
    expect(finish.state.lapTimesMs[0]).toBeCloseTo(1000)
    finish = crossFinishLine(tickRace(finish.state, 30))
    expect(finish.finished).toBe(true)
    expect(finish.state.phase).toBe('finished')
    expect(finish.state.totalMs).toBeCloseTo(31_000)
    expect(finish.state.bestLapMs).toBeCloseTo(1000)
    expect(raceResult(finish.state, 'harbor').lapTimesMs).toHaveLength(2)
  })

  it('ignores finish crossings before racing or after the finish', () => {
    const countdown = createRace(1, 3)
    expect(crossFinishLine(countdown).finished).toBe(false)
    const finished = { ...countdown, phase: 'finished' as const }
    expect(crossFinishLine(finished).finished).toBe(false)
  })

  it('formats race times consistently', () => {
    expect(formatRaceTime(0)).toBe('0:00.000')
    expect(formatRaceTime(61_234)).toBe('1:01.234')
    expect(formatShortTime(61_234)).toBe('1:01.2')
    expect(countdownLabel(0.2)).toBe('1')
    expect(countdownLabel(0)).toBe('GO')
  })
})


describe('keyboard steering', () => {
  it('keeps A left and D right', () => {
    expect(keyboardSteer(code => code === 'KeyA')).toBe(-1)
    expect(keyboardSteer(code => code === 'KeyD')).toBe(1)
    expect(keyboardSteer(code => code === 'ArrowLeft')).toBe(-1)
    expect(keyboardSteer(code => code === 'ArrowRight')).toBe(1)
  })
})

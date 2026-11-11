export type RacePhase = 'countdown' | 'racing' | 'finished'

export type RaceState = {
  phase: RacePhase
  unranked: boolean
  laps: number
  lap: number
  countdown: number
  elapsedMs: number
  lapStartedMs: number
  lapTimesMs: number[]
  totalMs: number
  bestLapMs: number
}

export type RaceResult = {
  trackId: string
  totalMs: number
  lapTimesMs: number[]
  bestLapMs: number
  unranked: boolean
}

export function createRace(laps: number, countdown: number, unranked = false): RaceState {
  return {
    phase: 'countdown',
    unranked,
    laps: Math.max(1, Math.floor(laps)),
    lap: 1,
    countdown,
    elapsedMs: 0,
    lapStartedMs: 0,
    lapTimesMs: [],
    totalMs: 0,
    bestLapMs: 0,
  }
}

export function tickRace(state: RaceState, dt: number): RaceState {
  if (state.phase === 'finished') return state
  const seconds = Math.max(0, dt)
  if (state.phase === 'countdown') {
    const countdown = state.countdown - seconds
    if (countdown > 0) return { ...state, countdown }
    const carry = -countdown
    return { ...state, phase: 'racing', countdown: 0, elapsedMs: Math.max(0, carry * 1000), lapStartedMs: 0 }
  }
  return { ...state, elapsedMs: state.elapsedMs + seconds * 1000 }
}

/**
 * Called when the car crosses the start/finish line in the forward direction. The first crossing
 * closes lap one; the final crossing finishes the race and freezes the total.
 */
export function crossFinishLine(state: RaceState): { state: RaceState; completedLap: number | null; finished: boolean } {
  if (state.phase !== 'racing') return { state, completedLap: null, finished: false }
  const completedLap = state.lap
  const lapTime = Math.max(0, state.elapsedMs - state.lapStartedMs)
  const lapTimesMs = [...state.lapTimesMs, lapTime]
  const bestLapMs = state.bestLapMs === 0 ? lapTime : Math.min(state.bestLapMs, lapTime)
  if (completedLap >= state.laps) {
    return {
      state: {
        ...state,
        phase: 'finished',
        lapTimesMs,
        bestLapMs,
        totalMs: state.elapsedMs,
      },
      completedLap,
      finished: true,
    }
  }
  return {
    state: {
      ...state,
      lap: completedLap + 1,
      lapTimesMs,
      bestLapMs,
      lapStartedMs: state.elapsedMs,
    },
    completedLap,
    finished: false,
  }
}

export function raceResult(state: RaceState, trackId: string): RaceResult {
  return {
    trackId,
    totalMs: state.totalMs,
    lapTimesMs: [...state.lapTimesMs],
    bestLapMs: state.bestLapMs,
    unranked: state.unranked,
  }
}

export function formatRaceTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms))
  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const millis = safe % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function formatShortTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms))
  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const tenths = Math.floor((safe % 1000) / 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}

export function countdownLabel(seconds: number): string {
  if (seconds <= 0) return 'GO'
  return String(Math.max(1, Math.ceil(seconds)))
}

export function isNewBest(previousMs: number, nextMs: number): boolean {
  return nextMs > 0 && (previousMs <= 0 || nextMs < previousMs)
}

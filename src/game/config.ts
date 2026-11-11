/**
 * Central gameplay tuning. The Tuning bridge exposes the controls that are useful to preview,
 * while these immutable defaults remain the source of truth for Reset and Save.
 */
export const DEFAULT_CONFIG = {
  car: {
    maxSpeed: 59,
    reverseSpeed: 9,
    acceleration: 24,
    brake: 46,
    rollingDrag: 1.1,
    airDrag: 0.0032,
    steerSpeed: 12.5,
    steerGrip: 8.8,
    driftGrip: 3.1,
    driftSteer: 1.38,
    boostSpeed: 15,
    boostAccel: 30,
    boostTime: 1.45,
    boostCost: 0.28,
    gravity: 25,
    wallRideMinSpeed: 22,
    collisionLoss: 0.58,
    rampMinSpeed: 19,
  },
  camera: {
    distance: 8.8,
    height: 3.1,
    fov: 63,
    speedFov: 11,
    follow: 6.5,
    shakeDecay: 4.2,
  },
  run: {
    countdown: 3.0,
    laps: 2,
    minLeaderboardMs: 45_000,
    maxLeaderboardMs: 900_000,
  },
} as const

type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)

export const CAR_LENGTH = 5.4
export const CAR_HALF_WIDTH = 0.96
export const SURFACE_LIFT = 0.42

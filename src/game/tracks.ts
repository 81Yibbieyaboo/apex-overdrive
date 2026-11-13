import * as THREE from 'three'

export type TrackId = 'harbor' | 'canyon' | 'vault'
export type Theme = 'harbor' | 'canyon' | 'vault'

export type RampSpec = {
  /** Normalised centre of the ramp. */
  at: number
  /** Peak height above the base centreline, in metres. */
  height: number
  /** Normalised length of the whole ramp. */
  length: number
  /** Upward launch component, multiplied by speed. */
  launch: number
}

export type BankSpec = {
  from: number
  to: number
  angle: number
}

export type WallRideSpec = { from: number; to: number; label: string }

export type TrackDef = {
  id: TrackId
  name: string
  shortName: string
  number: string
  subtitle: string
  tagline: string
  description: string
  difficulty: 'ROOKIE' | 'PRO' | 'EXPERT'
  laps: number
  width: number
  points: Array<[number, number, number]>
  ramps: RampSpec[]
  banks: BankSpec[]
  wallRide?: WallRideSpec
  accent: string
  secondary: string
  theme: Theme
  speedModifier: number
  gripModifier: number
}

export const TRACKS: TrackDef[] = [
  {
    id: 'harbor',
    name: 'Harbor Sprint',
    shortName: 'Harbor',
    number: '01',
    subtitle: 'SALTWIND DISTRICT',
    tagline: 'Hold the line. Find the air.',
    description: 'A longer blacktop dockside loop with four kickers, a raised wall ride, and enough runoff to learn the racing line.',
    difficulty: 'ROOKIE',
    laps: 2,
    width: 14,
    points: [
      [-115, 0, 55], [-50, 0.1, 80], [25, 0.2, 78], [90, 0.5, 55], [120, 0.8, 10],
      [105, 1.0, -40], [55, 0.9, -60], [20, 0.7, -35], [-5, 0.6, -60], [-50, 0.5, -75],
      [-95, 0.3, -45], [-105, 0.1, 5],
    ],
    ramps: [
      { at: 0.18, height: 3.6, length: 0.065, launch: 0.31 },
      { at: 0.39, height: 2.8, length: 0.055, launch: 0.28 },
      { at: 0.635, height: 4.2, length: 0.07, launch: 0.34 },
      { at: 0.86, height: 2.7, length: 0.05, launch: 0.27 },
    ],
    banks: [
      { from: 0.08, to: 0.17, angle: 0.15 },
      { from: 0.36, to: 0.46, angle: 0.18 },
      { from: 0.48, to: 0.62, angle: 1.18 },
      { from: 0.78, to: 0.88, angle: 0.14 },
    ],
    wallRide: { from: 0.48, to: 0.62, label: 'DOCKSIDE WALL RIDE' },
    accent: '#ff6b35',
    secondary: '#7ee0c2',
    theme: 'harbor',
    speedModifier: 1,
    gripModifier: 1.05,
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    shortName: 'Canyon',
    number: '02',
    subtitle: 'REDLINE GORGE',
    tagline: 'The desert rewards brave feet.',
    description: 'A long blacktop gorge circuit with four ramps, a huge tabletop jump, and a late canyon wall ride.',
    difficulty: 'PRO',
    laps: 2,
    width: 15,
    points: [
      [-150, 0, 95], [-70, 1.0, 125], [20, 2.0, 120], [90, 3.0, 85], [135, 4.0, 30],
      [110, 4.8, -20], [50, 5.0, -30], [20, 4.4, -70], [65, 4.0, -105], [20, 3.2, -140],
      [-60, 2.4, -120], [-115, 1.4, -70], [-130, 0.6, -5],
    ],
    ramps: [
      { at: 0.14, height: 5.4, length: 0.06, launch: 0.35 },
      { at: 0.36, height: 4.2, length: 0.05, launch: 0.32 },
      { at: 0.56, height: 8.2, length: 0.075, launch: 0.42 },
      { at: 0.79, height: 5.1, length: 0.06, launch: 0.35 },
    ],
    banks: [
      { from: 0.1, to: 0.16, angle: 0.2 },
      { from: 0.3, to: 0.37, angle: 0.24 },
      { from: 0.63, to: 0.7, angle: 0.26 },
      { from: 0.73, to: 0.84, angle: 1.22 },
      { from: 0.87, to: 0.93, angle: 0.2 },
    ],
    wallRide: { from: 0.73, to: 0.84, label: 'CANYON WALL RIDE' },
    accent: '#ff8a3d',
    secondary: '#ffd45e',
    theme: 'canyon',
    speedModifier: 1.06,
    gripModifier: 0.94,
  },
  {
    id: 'vault',
    name: 'Vault Ring',
    shortName: 'Vault',
    number: '03',
    subtitle: 'THE VERTICAL',
    tagline: 'Gravity is only a suggestion.',
    description: 'A long blacktop arena circuit built around a sustained magnetic wall ride and four high-speed launches.',
    difficulty: 'EXPERT',
    laps: 2,
    width: 16,
    points: [
      [-105, 2.0, 10], [-85, 2.3, -50], [-35, 2.7, -90], [30, 3.0, -95], [90, 3.4, -60],
      [110, 3.8, 0], [95, 4.1, 55], [50, 4.2, 90], [0, 4.0, 82], [-20, 3.8, 45],
      [-60, 3.7, 70], [-95, 3.3, 35],
    ],
    ramps: [
      { at: 0.12, height: 4.8, length: 0.06, launch: 0.34 },
      { at: 0.23, height: 3.5, length: 0.05, launch: 0.3 },
      { at: 0.69, height: 5.4, length: 0.07, launch: 0.37 },
      { at: 0.88, height: 3.6, length: 0.05, launch: 0.3 },
    ],
    banks: [
      { from: 0.05, to: 0.12, angle: 0.2 },
      { from: 0.3, to: 0.57, angle: 1.38 },
      { from: 0.58, to: 0.66, angle: 0.24 },
      { from: 0.84, to: 0.92, angle: 0.22 },
    ],
    wallRide: { from: 0.3, to: 0.57, label: 'MAGNETIC WALL RIDE' },
    accent: '#ff6b35',
    secondary: '#7ee0c2',
    theme: 'vault',
    speedModifier: 1.12,
    gripModifier: 0.9,
  },
]

export const TRACK_BY_ID: Record<TrackId, TrackDef> = Object.fromEntries(TRACKS.map(track => [track.id, track])) as Record<TrackId, TrackDef>

export type TrackSample = {
  pos: THREE.Vector3
  tangent: THREE.Vector3
  right: THREE.Vector3
  normal: THREE.Vector3
  bank: number
  curvature: number
  distance: number
}

export type SurfacePose = {
  pos: THREE.Vector3
  tangent: THREE.Vector3
  right: THREE.Vector3
  normal: THREE.Vector3
  quaternion: THREE.Quaternion
}

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const CIRCUIT_SCALE = 1.35
const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1)
const wrap01 = (v: number) => ((v % 1) + 1) % 1
const smooth = (v: number) => {
  const k = clamp01(v)
  return k * k * (3 - 2 * k)
}

/** Additive elevation for one ramp: a smooth climb, a short lip, then a fast landing transition. */
export function rampHeightAt(track: TrackDef, t: number): number {
  const p = wrap01(t)
  let total = 0
  for (const ramp of track.ramps) {
    const start = ramp.at - ramp.length * 0.5
    const lip = ramp.at + ramp.length * 0.04
    const end = ramp.at + ramp.length * 0.5
    if (p >= start && p <= lip) {
      const k = smooth((p - start) / Math.max(1e-6, lip - start))
      total += ramp.height * k
    } else if (p > lip && p <= end) {
      const k = smooth((p - lip) / Math.max(1e-6, end - lip))
      total += ramp.height * (1 - k)
    }
  }
  return total
}

/** Peak of each ramp where a fast car leaves the surface. */
export function launchPoints(track: TrackDef): number[] {
  return track.ramps.map(ramp => wrap01(ramp.at + ramp.length * 0.04))
}

/** Smoothly blend between bank zones, holding a plateau through the centre of long zones. */
export function bankAngleAt(track: TrackDef, t: number): number {
  const p = wrap01(t)
  let angle = 0
  for (const zone of track.banks) {
    if (p < zone.from || p > zone.to) continue
    const span = Math.max(1e-6, zone.to - zone.from)
    const local = (p - zone.from) / span
    const edge = Math.min(0.14, 3 / Math.max(20, span * 400))
    const inK = smooth(local / edge)
    const outK = 1 - smooth((local - (1 - edge)) / edge)
    angle = Math.max(angle, zone.angle * inK * outK)
  }
  return angle
}

export function wallRideAt(track: TrackDef, t: number): boolean {
  if (!track.wallRide) return false
  const p = wrap01(t)
  return p >= track.wallRide.from && p <= track.wallRide.to
}

/**
 * Arc-length sampled circuit. Every visible and physical feature (road, guardrails, ramps,
 * wall ride, camera, car, minimap) is derived from this model so they cannot drift apart.
 */
export class TrackModel {
  readonly samples: TrackSample[] = []
  readonly length: number
  readonly launches: number[]
  private readonly count: number

  constructor(readonly def: TrackDef, count = 900) {
    this.count = count
    const curve = new THREE.CatmullRomCurve3(
      def.points.map(([x, y, z]) => new THREE.Vector3(x * CIRCUIT_SCALE, y, z * CIRCUIT_SCALE)),
      true,
      'centripetal',
      0.5,
    )
    this.length = curve.getLength()
    for (let i = 0; i < count; i += 1) {
      const t = i / count
      const base = curve.getPointAt(t)
      const y = base.y + rampHeightAt(def, t)
      const pos = new THREE.Vector3(base.x, y, base.z)
      const ahead = curve.getPointAt(wrap01(t + 1 / count))
      ahead.y += rampHeightAt(def, wrap01(t + 1 / count))
      const behind = curve.getPointAt(wrap01(t - 1 / count))
      behind.y += rampHeightAt(def, wrap01(t - 1 / count))
      const tangent = ahead.clone().sub(behind).normalize()
      const left = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize()
      const bank = bankAngleAt(def, t)
      const normal = WORLD_UP.clone().multiplyScalar(Math.cos(bank)).addScaledVector(left, Math.sin(bank)).normalize()
      const right = new THREE.Vector3().crossVectors(normal, tangent).normalize()
      this.samples.push({ pos, tangent, right, normal, bank, curvature: 0, distance: t * this.length })
    }
    // Signed horizontal curvature: positive means the road turns right.
    for (let i = 0; i < count; i += 1) {
      const a = this.samples[i]
      const b = this.samples[(i + 1) % count]
      const ta = a.tangent.clone().setY(0).normalize()
      const tb = b.tangent.clone().setY(0).normalize()
      const angle = Math.atan2(ta.clone().cross(tb).y, THREE.MathUtils.clamp(ta.dot(tb), -1, 1))
      a.curvature = angle / (this.length / count)
    }
    this.launches = launchPoints(def)
  }

  sample(t: number): TrackSample {
    const p = wrap01(t) * this.count
    const i = Math.floor(p) % this.count
    const j = (i + 1) % this.count
    const a = this.samples[i]
    const b = this.samples[j]
    const k = p - Math.floor(p)
    const tangent = a.tangent.clone().lerp(b.tangent, k).normalize()
    const normal = a.normal.clone().lerp(b.normal, k)
    // Gram-Schmidt keeps the frame rigid through bank transitions.
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize()
    const right = new THREE.Vector3().crossVectors(normal, tangent).normalize()
    return {
      pos: a.pos.clone().lerp(b.pos, k),
      tangent,
      right,
      normal,
      bank: THREE.MathUtils.lerp(a.bank, b.bank, k),
      curvature: THREE.MathUtils.lerp(a.curvature, b.curvature, k),
      distance: a.distance + (b.distance - a.distance) * k,
    }
  }

  surfacePoint(t: number, lateral = 0, lift = 0): THREE.Vector3 {
    const s = this.sample(t)
    return s.pos.clone().addScaledVector(s.right, lateral).addScaledVector(s.normal, lift)
  }

  pose(t: number, lateral = 0, lift = 0, slip = 0): SurfacePose {
    const s = this.sample(t)
    const basis = new THREE.Matrix4().makeBasis(s.right, s.normal, s.tangent)
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis)
    if (slip !== 0) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(WORLD_UP, slip))
    const pos = s.pos.clone().addScaledVector(s.right, lateral).addScaledVector(s.normal, lift)
    return { pos, tangent: s.tangent, right: s.right, normal: s.normal, quaternion }
  }

  /** The next launch marker ahead of `t`, accounting for wrap. */
  nextLaunch(t: number, lookAhead = 0.08): number | null {
    const p = wrap01(t)
    let best: number | null = null
    let bestDelta = Infinity
    for (const launch of this.launches) {
      const delta = wrap01(launch - p)
      if (delta < lookAhead && delta < bestDelta) {
        best = launch
        bestDelta = delta
      }
    }
    return best
  }

  crossedLaunch(prevT: number, t: number): number | null {
    const a = wrap01(prevT)
    const b = wrap01(t)
    for (const launch of this.launches) {
      const crossed = a <= b ? launch > a && launch <= b : launch > a || launch <= b
      if (crossed) return launch
    }
    return null
  }
}

export function formatDifficulty(difficulty: TrackDef['difficulty']): string {
  return difficulty === 'ROOKIE' ? 'ROOKIE' : difficulty === 'PRO' ? 'PRO' : 'EXPERT'
}

/** Normalised 2D points for a crisp minimap in the menu and HUD. */
export function trackMapPoints(track: TrackDef, count = 72): Array<[number, number]> {
  const curve = new THREE.CatmullRomCurve3(
    track.points.map(([x, y, z]) => new THREE.Vector3(x * CIRCUIT_SCALE, y, z * CIRCUIT_SCALE)),
    true,
    'centripetal',
    0.5,
  )
  const raw: Array<[number, number]> = []
  for (let i = 0; i < count; i += 1) {
    const p = curve.getPointAt(i / count)
    raw.push([p.x, p.z])
  }
  const xs = raw.map(p => p[0])
  const zs = raw.map(p => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const scale = Math.max(maxX - minX, maxZ - minZ, 1e-6)
  const pad = 0.08
  const span = 1 - pad * 2
  const usedX = ((maxX - minX) / scale) * span
  const usedZ = ((maxZ - minZ) / scale) * span
  const originX = pad + (span - usedX) * 0.5
  const originZ = pad + (span - usedZ) * 0.5
  return raw.map(([x, z]) => [originX + ((x - minX) / scale) * span, originZ + ((z - minZ) / scale) * span])
}

export function trackSvg(track: TrackDef, width = 160, height = 96): string {
  const points = trackMapPoints(track)
  const path = points.map(([x, z], i) => `${i === 0 ? 'M' : 'L'}${(x * width).toFixed(1)},${(z * height).toFixed(1)}`).join(' ')
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${path}" fill="none" stroke="rgba(247,241,228,.18)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${(points[0][0] * width).toFixed(1)}" cy="${(points[0][1] * height).toFixed(1)}" r="4.5" fill="#f7f1e4"/></svg>`
}

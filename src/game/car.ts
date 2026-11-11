import * as THREE from 'three'
import { CONFIG, CAR_HALF_WIDTH, SURFACE_LIFT } from './config'
import type { TrackModel } from './tracks'
import { wallRideAt } from './tracks'

export type CarControls = {
  throttle: number
  steer: number
  drift: boolean
  boost: boolean
}

export type CarEventType = 'jump' | 'land' | 'boost' | 'airBoost' | 'collision' | 'wallRide' | 'wallRideEnd'
export type CarEvent = { type: CarEventType; intensity?: number }

const damp = (current: number, target: number, lambda: number, dt: number) => THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Arcade car simulation on the track surface. Progress is arc-length based, lateral grip is
 * independent, and vertical motion switches to ballistic flight at a ramp lip. The wall ride is
 * the same model with a steep bank, so the car, camera and road always share a basis.
 */
export class Car {
  readonly root = new THREE.Group()
  t = 0.012
  lateral = 0
  speed = 0
  lateralVel = 0
  airborne = false
  airY = 0
  vy = 0
  airTime = 0
  boostTimer = 0
  boostMeter = 0.38
  drift = 0
  wallRiding = false
  slip = 0
  private track: TrackModel | null = null
  private collisionCooldown = 0
  private boostHeld = false
  private prevT = 0.012
  private visualRoll = 0
  private visualPitch = 0

  constructor() {
    this.root.name = 'apex-car-root'
  }

  reset(track: TrackModel, t = 0.012, lateral = 0): void {
    this.track = track
    this.t = t
    this.prevT = t
    this.lateral = lateral
    this.speed = 0
    this.lateralVel = 0
    this.airborne = false
    this.vy = 0
    this.airTime = 0
    this.boostTimer = 0
    this.boostMeter = 0.38
    this.drift = 0
    this.wallRiding = false
    this.slip = 0
    this.collisionCooldown = 0
    this.visualRoll = 0
    this.visualPitch = 0
    const pose = track.pose(this.t, this.lateral, SURFACE_LIFT, 0)
    this.airY = pose.pos.y
    this.root.position.copy(pose.pos)
    this.root.quaternion.copy(pose.quaternion)
  }

  get maxLateral(): number {
    if (!this.track) return 0
    return this.track.def.width / 2 - CAR_HALF_WIDTH - 0.25
  }

  get progress(): number {
    return this.t
  }

  get previousProgress(): number {
    return this.prevT
  }

  get lapDistance(): number {
    return this.track ? this.t * this.track.length : 0
  }

  /** True when the car is actually sliding enough to warrant tire audio/smoke. */
  get isDrifting(): boolean {
    return this.drift > 0.12 && this.speed > 8 && !this.airborne
  }

  step(dt: number, controls: CarControls, track: TrackModel): CarEvent[] {
    if (this.track !== track) this.reset(track)
    const events: CarEvent[] = []
    const car = CONFIG.car
    const sample = track.sample(this.t)
    const maxSpeed = car.maxSpeed * track.def.speedModifier + (this.boostTimer > 0 ? car.boostSpeed : 0)
    const throttle = clamp(controls.throttle, -1, 1)
    const steer = clamp(controls.steer, -1, 1)
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt)

    if (controls.boost && !this.boostHeld && this.boostMeter >= car.boostCost && this.boostTimer <= 0) {
      this.boostMeter = Math.max(0, this.boostMeter - car.boostCost)
      this.boostTimer = car.boostTime
      events.push({ type: 'boost' })
    }
    this.boostHeld = controls.boost
    this.boostTimer = Math.max(0, this.boostTimer - dt)

    // Longitudinal response. Airborne cars coast except for a small air-throttle response.
    if (!this.airborne) {
      if (throttle > 0.02) {
        const headroom = 1 - clamp(this.speed / Math.max(1, maxSpeed), 0, 0.96) * 0.65
        const boostKick = this.boostTimer > 0 ? car.boostAccel : 0
        this.speed += (car.acceleration + boostKick) * throttle * headroom * dt
      } else if (throttle < -0.02) {
        if (this.speed > 0.5) this.speed -= car.brake * Math.abs(throttle) * dt
        else this.speed -= car.acceleration * 0.58 * Math.abs(throttle) * dt
      } else {
        this.speed -= Math.sign(this.speed) * (car.rollingDrag + this.speed * this.speed * car.airDrag) * dt
      }
    } else {
      this.speed -= this.speed * this.speed * car.airDrag * 0.55 * dt
      if (throttle > 0) this.speed += car.acceleration * 0.12 * dt
    }
    this.speed = clamp(this.speed, -car.reverseSpeed, maxSpeed)
    if (Math.abs(this.speed) < 0.025 && throttle === 0) this.speed = 0

    const bank = sample.bank
    const inWallRide = wallRideAt(track.def, this.t)
    if (inWallRide && !this.airborne) {
      if (this.speed > 0 && this.speed < car.wallRideMinSpeed && throttle >= 0) {
        this.speed += (car.wallRideMinSpeed - this.speed) * 1.8 * dt
      }
    }

    this.prevT = this.t
    const direction = this.speed >= 0 ? 1 : -1
    this.t = ((this.t + (this.speed * dt) / track.length) % 1 + 1) % 1

    // A launch marker only fires once the car is moving quickly enough to clear the lip.
    if (!this.airborne && this.speed > car.rampMinSpeed) {
      const launch = track.crossedLaunch(this.prevT, this.t)
      if (launch !== null) {
        this.airborne = true
        this.airTime = 0
        this.vy = this.speed * 0.31 + 2.4
        events.push({ type: 'jump', intensity: clamp(this.speed / 62, 0, 1) })
      }
    }

    // Lateral grip: steering target minus outward centrifugal force, damped more slowly in a drift.
    const driftActive = controls.drift && Math.abs(this.speed) > 12 && !this.airborne
    const speedK = clamp(Math.abs(this.speed) / 28, 0, 1)
    const steerPower = car.steerSpeed * (0.3 + speedK * 0.7) * (driftActive ? car.driftSteer : 1) * direction
    const centrifugal = -sample.curvature * this.speed * this.speed * 0.36
    const grip = this.airborne ? 0.85 : driftActive ? car.driftGrip : car.steerGrip
    const targetLat = this.airborne ? steer * 4.2 : steer * steerPower + centrifugal
    this.lateralVel = damp(this.lateralVel, targetLat, grip, dt)
    this.lateral += this.lateralVel * dt
    const edge = this.maxLateral
    const wasAtEdge = Math.abs(this.lateral) >= edge - 0.03
    if (this.lateral > edge || this.lateral < -edge) {
      const side = this.lateral > 0 ? 1 : -1
      const impactSpeed = Math.abs(this.lateralVel)
      this.lateral = side * edge
      this.lateralVel *= -0.18
      if (!wasAtEdge) {
        if (!this.airborne) this.speed *= car.collisionLoss
        if (impactSpeed > 2.5 && this.collisionCooldown <= 0) {
          this.collisionCooldown = 0.55
          events.push({ type: 'collision', intensity: clamp(impactSpeed / 8 + 0.3, 0.2, 1) })
        }
      }
      if (!this.airborne) this.speed *= 0.997
    }
    this.drift = damp(this.drift, driftActive ? 1 : 0, driftActive ? 5 : 3.2, dt)
    if (driftActive && this.speed > 12) {
      this.boostMeter = Math.min(1, this.boostMeter + dt * 0.085)
    }

    // Vertical flight. X/Z remain on the track ribbon; only height becomes ballistic.
    const ground = track.surfacePoint(this.t, this.lateral, SURFACE_LIFT)
    if (this.airborne) {
      this.airTime += dt
      this.vy -= car.gravity * dt
      this.airY += this.vy * dt
      if (this.airY <= ground.y && this.vy < 0) {
        const impact = clamp(-this.vy / 22, 0.2, 1)
        this.airborne = false
        this.airY = ground.y
        this.vy = 0
        if (this.airTime > 0.28) {
          this.boostTimer = Math.max(this.boostTimer, 1.05)
          this.boostMeter = Math.min(1, this.boostMeter + 0.16)
          events.push({ type: 'land', intensity: impact })
          events.push({ type: 'airBoost', intensity: impact })
        } else {
          events.push({ type: 'land', intensity: impact })
        }
        this.airTime = 0
      }
    } else {
      this.airY = ground.y
    }

    const wasWall = this.wallRiding
    this.wallRiding = inWallRide && !this.airborne && bank > 0.95
    if (this.wallRiding !== wasWall) events.push({ type: this.wallRiding ? 'wallRide' : 'wallRideEnd' })

    const slipTarget = this.airborne ? 0 : driftActive ? clamp(this.lateralVel / Math.max(7, Math.abs(this.speed)) * 1.1, -0.48, 0.48) : clamp(this.lateralVel / Math.max(12, Math.abs(this.speed)) * 0.28, -0.18, 0.18)
    this.slip = damp(this.slip, slipTarget, 5, dt)
    const pose = track.pose(this.t, this.lateral, SURFACE_LIFT, this.slip)
    const pos = pose.pos.clone()
    if (this.airborne) pos.y = this.airY
    this.root.position.copy(pos)
    this.root.quaternion.copy(pose.quaternion)

    if (this.airborne) {
      // Level the car in the air, retaining the track heading and a small nose pitch.
      const up = new THREE.Vector3(0, 1, 0)
      const forward = pose.tangent.clone().setY(0)
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1)
      forward.normalize()
      const right = new THREE.Vector3().crossVectors(up, forward).normalize().negate()
      const airQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward))
      this.root.quaternion.slerp(airQ, 0.78)
      const pitch = clamp(-this.vy * 0.012, -0.17, 0.17)
      this.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch))
    } else {
      this.visualRoll = damp(this.visualRoll, steer * 0.035 * speedK, 5, dt)
      this.visualPitch = damp(this.visualPitch, throttle * -0.012 + (this.speed > 45 ? 0.012 : 0), 4, dt)
      this.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.visualRoll))
      this.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.visualPitch))
    }
    return events
  }

  /** Surface point under the car, used for the blob shadow and smoke emitters. */
  surfacePoint(track: TrackModel): THREE.Vector3 {
    return track.surfacePoint(this.t, this.lateral, 0.035)
  }

  /** Direction from the car toward its local rear, in world space. */
  rearPoint(): THREE.Vector3 {
    return new THREE.Vector3(0, 0.42, -2.3).applyQuaternion(this.root.quaternion).add(this.root.position)
  }
}

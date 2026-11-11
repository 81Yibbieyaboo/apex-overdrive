import * as THREE from 'three'
import { CONFIG } from './config'
import type { Car } from './car'
import type { TrackModel } from './tracks'

/**
 * Third-person chase camera. The camera basis leans with the car through the wall ride while
 * retaining a world-up bias, so the horizon rotates enough to sell the vertical track without
 * making steering unreadable.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  private shake = 0
  private currentUp = new THREE.Vector3(0, 1, 0)
  private orbit = 0.1
  private reducedMotion = false

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.08, 1200)
    this.camera.position.set(0, 6, 14)
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value
  }

  impact(intensity: number): void {
    this.shake = Math.max(this.shake, Math.min(1, intensity))
  }

  showcase(car: Car, track: TrackModel, dt: number, speedScale = 1): void {
    this.orbit += dt * 0.18 * speedScale
    const target = car.root.position.clone().add(new THREE.Vector3(0, 0.95, 0))
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.root.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(car.root.quaternion)
    const orbitPos = target.clone()
      .addScaledVector(forward, Math.cos(this.orbit) * 9.4)
      .addScaledVector(right, Math.sin(this.orbit) * 11.4)
      .add(new THREE.Vector3(0, 3.2 + Math.sin(this.orbit * 0.8) * 0.45, 0))
    const ground = track.surfacePoint(car.t, car.lateral, 0.4)
    orbitPos.y = Math.max(orbitPos.y, ground.y + 1.3)
    this.camera.position.lerp(orbitPos, 1 - Math.exp(-4.2 * dt))
    this.currentUp.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-5 * dt)).normalize()
    this.camera.up.copy(this.currentUp)
    this.camera.lookAt(target)
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 52, 3, dt)
    this.camera.updateProjectionMatrix()
    this.shake = 0
  }

  chase(car: Car, track: TrackModel, dt: number): void {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.root.quaternion).normalize()
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(car.root.quaternion).normalize()
    const speedK = THREE.MathUtils.clamp(Math.abs(car.speed) / 58, 0, 1)
    const portrait = this.camera.aspect < 0.82 ? 2.4 : this.camera.aspect < 1.08 ? 1.1 : 0
    const distance = CONFIG.camera.distance + speedK * 2.2 + (car.airborne ? 1.2 : 0) + portrait - (car.wallRiding ? 1.1 : 0)
    const height = CONFIG.camera.height + speedK * 0.55 + portrait * 0.18
    const desired = car.root.position.clone()
      .addScaledVector(forward, -distance)
      .addScaledVector(carUp, height)
    const surface = track.surfacePoint(car.t, car.lateral, 0.5)
    desired.y = Math.max(desired.y, surface.y + 1.15)
    const follow = 1 - Math.exp(-CONFIG.camera.follow * dt)
    this.camera.position.lerp(desired, follow)
    const targetUp = new THREE.Vector3(0, 1, 0).lerp(carUp, car.wallRiding ? 0.7 : 0.28).normalize()
    this.currentUp.lerp(targetUp, 1 - Math.exp(-5.8 * dt)).normalize()
    if (this.reducedMotion) this.currentUp.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-8 * dt)).normalize()
    this.camera.up.copy(this.currentUp)
    const lookAhead = (5.2 + speedK * 3) * (car.wallRiding ? 0.55 : 1)
    const lookTarget = car.root.position.clone().addScaledVector(forward, lookAhead).addScaledVector(carUp, 1.1)
    this.camera.lookAt(lookTarget)
    const fov = CONFIG.camera.fov + speedK * CONFIG.camera.speedFov + (car.boostTimer > 0 ? 3.5 : 0)
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 3.8, dt)
    this.camera.updateProjectionMatrix()
    if (this.shake > 0.001 && !this.reducedMotion) {
      const amp = this.shake * 0.16
      this.camera.position.x += (Math.random() - 0.5) * amp
      this.camera.position.y += (Math.random() - 0.5) * amp
      this.camera.rotateZ((Math.random() - 0.5) * this.shake * 0.006)
      this.shake = Math.max(0, this.shake - dt * CONFIG.camera.shakeDecay)
    }
  }
}

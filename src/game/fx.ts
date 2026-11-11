import * as THREE from 'three'
import type { Car } from './car'
import type { TrackModel } from './tracks'

type Particle = { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; gravity: number; size: number }

function softDot(color: string, size: number, opacity: number, additive = false): THREE.PointsMaterial {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,.8)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  return new THREE.PointsMaterial({ color, size, map: texture, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true })
}

/** Lightweight pooled particles for tire smoke, landing dust and boost sparks. */
export class Effects {
  readonly group = new THREE.Group()
  private smoke: Particle[] = []
  private sparks: Particle[] = []
  private smokePoints: THREE.Points
  private sparkPoints: THREE.Points
  private smokeGeo = new THREE.BufferGeometry()
  private sparkGeo = new THREE.BufferGeometry()
  private smokePositions = new Float32Array(240 * 3)
  private sparkPositions = new Float32Array(160 * 3)
  private reducedMotion = false
  private smokeClock = 0
  private sparkClock = 0

  constructor() {
    this.group.add(new THREE.Points(this.smokeGeo, softDot('#f2e9d6', 1.6, 0.28)))
    this.group.add(new THREE.Points(this.sparkGeo, softDot('#ffb347', 0.32, 0.95, true)))
    this.smokePoints = this.group.children[0] as THREE.Points
    this.sparkPoints = this.group.children[1] as THREE.Points
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3))
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3))
    this.smokePoints.frustumCulled = false
    this.sparkPoints.frustumCulled = false
    this.smokePositions.fill(-999)
    this.sparkPositions.fill(-999)
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value
  }

  private emit(target: Particle[], position: THREE.Vector3, velocity: THREE.Vector3, life: number, gravity: number, size: number): void {
    if (target.length >= 240) target.shift()
    target.push({ pos: position.clone(), vel: velocity.clone(), life, max: life, gravity, size })
  }

  drift(car: Car, track: TrackModel): void {
    if (this.reducedMotion) return
    this.smokeClock -= 1 / 60
    if (this.smokeClock > 0) return
    this.smokeClock = 0.035
    const surface = car.surfacePoint(track)
    const rear = car.rearPoint()
    for (const side of [-0.7, 0.7]) {
      const p = rear.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(car.root.quaternion), side)
      p.y = Math.max(p.y, surface.y + 0.2)
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.1, (Math.random() - 0.5) * 1.5)
      this.emit(this.smoke, p, v, 0.7 + Math.random() * 0.6, -0.5, 1)
    }
  }

  boost(car: Car): void {
    if (this.reducedMotion) return
    this.sparkClock -= 1 / 60
    if (this.sparkClock > 0) return
    this.sparkClock = 0.045
    const rear = car.rearPoint()
    for (let i = 0; i < 3; i += 1) {
      const p = rear.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.1, (Math.random() - 0.5) * 0.4))
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.8, 0.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.8)
      this.emit(this.sparks, p, v, 0.28 + Math.random() * 0.22, 2.4, 0.5)
    }
  }

  burst(car: Car, track: TrackModel, kind: 'land' | 'collision' | 'finish' = 'land'): void {
    if (this.reducedMotion) return
    const surface = car.surfacePoint(track)
    const count = kind === 'finish' ? 80 : kind === 'collision' ? 10 : 26
    const target = kind === 'collision' ? this.sparks : this.smoke
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * 2.4
      const p = surface.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0.15 + Math.random() * 0.4, Math.sin(angle) * radius))
      const speed = kind === 'finish' ? 4.5 : 1.8 + Math.random() * 4.2
      const v = new THREE.Vector3(Math.cos(angle) * speed, (kind === 'finish' ? 5 : 2.2) + Math.random() * 2.8, Math.sin(angle) * speed)
      this.emit(target, p, v, kind === 'finish' ? 1.5 : 0.55 + Math.random() * 0.6, kind === 'finish' ? 7 : 3, 1)
    }
  }

  update(dt: number): void {
    const step = (particles: Particle[], positions: Float32Array, points: THREE.Points) => {
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i]
        p.life -= dt
        if (p.life <= 0) { particles.splice(i, 1); continue }
        p.vel.y += p.gravity * dt
        p.pos.addScaledVector(p.vel, dt)
      }
      positions.fill(-999)
      particles.forEach((p, i) => positions.set([p.pos.x, p.pos.y, p.pos.z], i * 3))
      const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute
      attr.needsUpdate = true
    }
    step(this.smoke, this.smokePositions, this.smokePoints)
    step(this.sparks, this.sparkPositions, this.sparkPoints)
  }

  clear(): void {
    this.smoke = []
    this.sparks = []
    this.smokePositions.fill(-999)
    this.sparkPositions.fill(-999)
  }
}

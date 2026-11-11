import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CAR_LENGTH } from './config'

export type CarLoadProgress = (fraction: number, status: string) => void

/**
 * Visual layer for the hero car. The gameplay transform owns the root; the loaded GLB and its
 * local effects sit underneath it so collision, camera and shadow never drift from the mesh.
 */
export class CarVisual {
  readonly root = new THREE.Group()
  readonly modelHolder = new THREE.Group()
  readonly shadow: THREE.Mesh
  readonly flames: THREE.Group
  private wheels: Array<{ node: THREE.Object3D; axis: 'x' | 'z'; direction: number }> = []
  private body: THREE.Object3D | null = null
  private fallback = false
  private wheelSpin = 0
  private bodyPitch = 0
  private bodyBaseY = 0
  private time = 0

  constructor() {
    this.root.add(this.modelHolder)
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    const coreMat = new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    this.flames = new THREE.Group()
    for (const x of [-0.34, 0.34]) {
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 7), flameMat)
      outer.rotation.x = -Math.PI / 2
      outer.position.set(x, 0.48, -2.38)
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.55, 6), coreMat)
      core.rotation.x = -Math.PI / 2
      core.position.set(x, 0.48, -2.25)
      this.flames.add(outer, core)
    }
    this.flames.visible = false
    this.root.add(this.flames)

    const shadowGeo = new THREE.CircleGeometry(2.1, 28)
    shadowGeo.rotateX(-Math.PI / 2)
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: '#102023', transparent: true, opacity: 0.28, depthWrite: false }),
    )
    this.shadow.renderOrder = 2
  }

  async load(url: string, onProgress?: CarLoadProgress): Promise<void> {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url, event => {
      if (!event.total) return
      onProgress?.(event.loaded / event.total, 'Preparing the hero car')
    })
    const scene = gltf.scene
    scene.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of mats) {
        if ('roughness' in material) (material as THREE.MeshStandardMaterial).roughness = Math.max(0.34, (material as THREE.MeshStandardMaterial).roughness ?? 0.5)
        if ('metalness' in material) (material as THREE.MeshStandardMaterial).metalness = Math.min(0.55, (material as THREE.MeshStandardMaterial).metalness ?? 0.1)
      }
    })
    // The image-to-3D export runs nose-first along X. The game's forward axis is +Z.
    scene.rotation.y = -Math.PI / 2
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const scale = CAR_LENGTH / Math.max(size.x, size.z, 0.01)
    scene.scale.setScalar(scale)
    scene.updateMatrixWorld(true)
    const scaled = new THREE.Box3().setFromObject(scene)
    const center = scaled.getCenter(new THREE.Vector3())
    scene.position.set(-center.x, -scaled.min.y + 0.04, -center.z)
    this.bodyBaseY = scene.position.y
    this.modelHolder.clear()
    this.modelHolder.add(scene)
    this.body = scene
    this.fallback = false
    this.findWheels(scene)
  }

  /** Reliable original car silhouette used while the GLB downloads or if delivery fails. */
  useFallback(): void {
    if (this.modelHolder.children.length && !this.fallback) return
    this.fallback = true
    this.bodyBaseY = 0
    this.modelHolder.clear()
    this.wheels = []
    const group = new THREE.Group()
    const coral = new THREE.MeshStandardMaterial({ color: '#f06a3b', roughness: 0.55, metalness: 0.12, flatShading: true })
    const cream = new THREE.MeshStandardMaterial({ color: '#f6eedc', roughness: 0.62, flatShading: true })
    const charcoal = new THREE.MeshStandardMaterial({ color: '#1d2326', roughness: 0.58, metalness: 0.22, flatShading: true })
    const gold = new THREE.MeshStandardMaterial({ color: '#c89a56', roughness: 0.38, metalness: 0.5, flatShading: true })
    const tire = new THREE.MeshStandardMaterial({ color: '#17191b', roughness: 0.92, flatShading: true })
    const mint = new THREE.MeshStandardMaterial({ color: '#79d9b7', roughness: 0.5, flatShading: true })

    const tub = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 1.8, 4, 10), coral)
    tub.rotation.x = Math.PI / 2
    tub.scale.set(0.82, 0.78, 0.72)
    tub.position.set(0, 0.62, -0.2)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.5, 6), cream)
    nose.rotation.x = -Math.PI / 2
    nose.position.set(0, 0.53, 2.25)
    nose.scale.set(1.15, 1, 0.62)
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 1.25), charcoal)
    cockpit.position.set(0, 1.02, -0.25)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.065, 6, 18, Math.PI), charcoal)
    halo.rotation.set(0, 0, 0)
    halo.position.set(0, 1.42, -0.05)
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.65, 1.35), coral)
    engine.position.set(0, 0.84, -1.42)
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.11, 0.58), charcoal)
    rearWing.position.set(0, 1.55, -2.05)
    for (const x of [-0.68, 0.68]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.68, 0.25), charcoal)
      strut.position.set(x, 1.15, -2.0)
      group.add(strut)
    }
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.1, 0.66), charcoal)
    frontWing.position.set(0, 0.31, 3.1)
    for (const x of [-1.15, 1.15]) {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.7), mint)
      endplate.position.set(x, 0.46, 3.08)
      group.add(endplate)
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 2.8), cream)
    stripe.position.set(0, 0.94, 1.25)
    group.add(tub, nose, cockpit, halo, engine, rearWing, frontWing, stripe)
    const wheelGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.34, 14)
    wheelGeo.rotateZ(Math.PI / 2)
    const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.355, 10)
    rimGeo.rotateZ(Math.PI / 2)
    for (const x of [-1.18, 1.18]) {
      for (const z of [1.95, -1.5]) {
        const wheel = new THREE.Group()
        const rubber = new THREE.Mesh(wheelGeo, tire)
        const rim = new THREE.Mesh(rimGeo, gold)
        wheel.add(rubber, rim)
        wheel.position.set(x, 0.46, z)
        wheel.userData.spin = true
        group.add(wheel)
        this.wheels.push({ node: wheel, axis: 'x', direction: 1 })
      }
    }
    this.modelHolder.add(group)
    this.body = group
  }

  private findWheels(scene: THREE.Object3D): void {
    this.wheels = []
    scene.traverse(obj => {
      if (!/wheel|tyre|tire/i.test(obj.name) || obj === scene) return
      if (obj.children.length > 2) return
      this.wheels.push({ node: obj, axis: 'x', direction: obj.position.z > 0 ? 1 : 1 })
    })
    if (this.wheels.length > 8) this.wheels = this.wheels.slice(0, 8)
  }

  animate(frameSeconds: number, speed: number, boost: number, drift: number): void {
    this.time += frameSeconds
    this.flames.visible = boost > 0.05
    if (this.flames.visible) {
      const flicker = 0.75 + Math.sin(this.time * 50) * 0.15 + Math.random() * 0.1
      this.flames.scale.setScalar(flicker * (0.8 + Math.min(0.35, speed / 100)))
      for (const child of this.flames.children) {
        const mesh = child as THREE.Mesh
        ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.random() * 0.3
      }
    }
    this.wheelSpin += frameSeconds * speed * 1.6
    for (const wheel of this.wheels) wheel.node.rotation[wheel.axis] = this.wheelSpin * wheel.direction
    // The model is a rigid shell: a tiny suspension squat and yaw offset add life without moving its root.
    if (this.body) {
      this.bodyPitch = THREE.MathUtils.damp(this.bodyPitch, -drift * 0.035, 6, frameSeconds)
      this.body.rotation.z = this.bodyPitch
      this.body.position.y = this.bodyBaseY + Math.sin(this.time * 13) * 0.012 * Math.min(1, speed / 30)
    }
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible
  }
}

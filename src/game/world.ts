import * as THREE from 'three'
import type { Quality } from '../engine/save'
import type { TrackDef, TrackModel, TrackSample } from './tracks'
import { wallRideAt } from './tracks'

type RNG = () => number
const makeRng = (seed: number): RNG => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
/** A complete themed circuit, built from the same TrackModel used by the car and minimap. */
export class TrackWorld {
  readonly root = new THREE.Group()
  readonly sun: THREE.DirectionalLight
  hemisphere!: THREE.HemisphereLight
  readonly groundY: number
  private disposables: Array<{ dispose(): void }> = []
  private water?: THREE.Mesh
  private time = 0

  constructor(
    readonly scene: THREE.Scene,
    readonly def: TrackDef,
    readonly model: TrackModel,
    quality: Quality,
    readonly reducedMotion = false,
  ) {
    this.groundY = def.theme === 'canyon' ? -8 : def.theme === 'vault' ? -1.2 : -0.45
    this.root.name = `track-${def.id}`
    scene.add(this.root)
    this.buildSky()
    this.sun = this.buildLights(quality)
    this.buildGround()
    this.buildRoad()
    this.buildBarriers()
    this.buildSupports()
    this.buildStartGantry()
    this.buildRamps()
    if (def.wallRide) this.buildWallRide()
    this.buildScenery()
    this.buildClouds()
    this.buildGrandstand(this.model.sample(0.994), 1)
    scene.fog = new THREE.Fog(this.skyColor(), def.theme === 'canyon' ? 150 : 185, def.theme === 'canyon' ? 560 : 680)
  }

  private own<T extends { dispose(): void }>(value: T): T {
    this.disposables.push(value)
    return value
  }

  private mat(options: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return this.own(new THREE.MeshStandardMaterial(options))
  }

  private skyColor(): THREE.Color {
    return new THREE.Color(this.def.theme === 'canyon' ? '#e9b28a' : this.def.theme === 'vault' ? '#a8dcd9' : '#a9d9e8')
  }

  private buildSky(): THREE.Mesh {
    const top = new THREE.Color(this.def.theme === 'canyon' ? '#4d8ca7' : this.def.theme === 'vault' ? '#4e95aa' : '#4b9cc5')
    const bottom = new THREE.Color(this.def.theme === 'canyon' ? '#f5c79e' : this.def.theme === 'vault' ? '#d2ece4' : '#d5ebdf')
    const material = this.own(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: top }, bottom: { value: bottom } },
      vertexShader: 'varying vec3 vWorld; void main(){ vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vWorld; void main(){ float h = clamp(normalize(vWorld).y * .7 + .38, 0., 1.); gl_FragColor = vec4(mix(bottom, top, smoothstep(0., 1., h)), 1.); }',
    }))
    const mesh = new THREE.Mesh(this.own(new THREE.SphereGeometry(900, 32, 16)), material)
    mesh.renderOrder = -10
    this.root.add(mesh)
    return mesh
  }

  private buildLights(quality: Quality): THREE.DirectionalLight {
    this.hemisphere = new THREE.HemisphereLight(this.def.theme === 'canyon' ? '#ffe0b5' : '#e9fbff', this.def.theme === 'canyon' ? '#8f543e' : '#4c5d55', 1.65)
    this.root.add(this.hemisphere)
    const sun = new THREE.DirectionalLight('#fff4db', 3.15)
    sun.position.set(-95, 145, 80)
    sun.target.position.set(0, 0, -20)
    sun.castShadow = quality !== 'low'
    const mapSize = quality === 'high' ? 2048 : 1024
    sun.shadow.mapSize.set(mapSize, mapSize)
    sun.shadow.camera.left = -175
    sun.shadow.camera.right = 175
    sun.shadow.camera.top = 175
    sun.shadow.camera.bottom = -175
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 430
    sun.shadow.bias = -0.00025
    sun.shadow.normalBias = 0.028
    this.root.add(sun, sun.target)
    const rim = new THREE.DirectionalLight(this.def.theme === 'canyon' ? '#ff9b62' : '#a3f3df', 0.72)
    rim.position.set(120, 45, -100)
    this.root.add(rim)
    return sun
  }

  private makeGroundTexture(base: string, specks: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = base
    ctx.fillRect(0, 0, 256, 256)
    const rng = makeRng(this.def.id.length * 9881 + 3)
    ctx.fillStyle = specks
    for (let i = 0; i < 1250; i += 1) {
      ctx.globalAlpha = 0.12 + rng() * 0.2
      const s = 1 + rng() * 3
      ctx.fillRect(rng() * 256, rng() * 256, s, s)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(55, 55)
    texture.colorSpace = THREE.SRGBColorSpace
    return this.own(texture)
  }

  private buildGround(): void {
    const base = this.def.theme === 'canyon' ? '#a86144' : this.def.theme === 'vault' ? '#6f817d' : '#a9a38e'
    const speck = this.def.theme === 'canyon' ? '#e3a077' : this.def.theme === 'vault' ? '#9db0a8' : '#c9c0a9'
    const texture = this.makeGroundTexture(base, speck)
    const material = this.mat({ map: texture, color: '#ffffff', roughness: 0.96, metalness: 0 })
    const ground = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1100, 1100)), material)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = this.groundY
    ground.receiveShadow = true
    this.root.add(ground)
    if (this.def.theme === 'harbor') {
      const waterMat = this.mat({ color: '#4a9eaa', roughness: 0.24, metalness: 0.18 })
      this.water = new THREE.Mesh(this.own(new THREE.PlaneGeometry(520, 920)), waterMat)
      this.water.rotation.x = -Math.PI / 2
      this.water.position.set(310, this.groundY + 0.16, -20)
      this.root.add(this.water)
    }
    if (this.def.theme === 'canyon') {
      const floor = new THREE.Mesh(this.own(new THREE.PlaneGeometry(700, 700)), this.mat({ color: '#7f4b3a', roughness: 0.98 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.y = this.groundY - 0.1
      this.root.add(floor)
    }
  }

  private asphaltTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111318'
    ctx.fillRect(0, 0, 256, 512)
    const rng = makeRng(82 + this.def.id.length)
    for (let i = 0; i < 2600; i += 1) {
      const v = 18 + Math.floor(rng() * 17)
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 3},${0.22 + rng() * 0.3})`
      ctx.fillRect(rng() * 256, rng() * 512, 1 + rng() * 3, 1 + rng() * 3)
    }
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#59616a'
    for (let i = 0; i < 10; i += 1) ctx.fillRect(0, rng() * 512, 256, 1)
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    return this.own(texture)
  }

  private ribbon(offsetA: number, offsetB: number, lift: number, material: THREE.Material, vScale = 8): THREE.Mesh {
    const samples = this.model.samples
    const count = samples.length
    const positions = new Float32Array(count * 2 * 3)
    const uvs = new Float32Array(count * 2 * 2)
    const indices: number[] = []
    for (let i = 0; i < count; i += 1) {
      const s = samples[i]
      const a = s.pos.clone().addScaledVector(s.right, offsetA).addScaledVector(s.normal, lift)
      const b = s.pos.clone().addScaledVector(s.right, offsetB).addScaledVector(s.normal, lift)
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
      const v = s.distance / vScale
      uvs.set([0, v, 1, v], i * 4)
      const j = (i + 1) % count
      indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1)
    }
    const geometry = this.own(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.castShadow = false
    this.root.add(mesh)
    return mesh
  }

  private curb(offset: number): THREE.Mesh {
    const inner = offset
    const outer = offset + Math.sign(offset) * 0.85
    const samples = this.model.samples
    const count = samples.length
    const positions = new Float32Array(count * 2 * 3)
    const colors = new Float32Array(count * 2 * 3)
    const indices: number[] = []
    const coral = new THREE.Color(this.def.accent)
    const cream = new THREE.Color('#f7f1e4')
    for (let i = 0; i < count; i += 1) {
      const s = samples[i]
      const a = s.pos.clone().addScaledVector(s.right, inner).addScaledVector(s.normal, 0.035)
      const b = s.pos.clone().addScaledVector(s.right, outer).addScaledVector(s.normal, 0.035)
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
      const color = Math.floor(s.distance / 2.8) % 2 === 0 ? coral : cream
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6)
      const j = (i + 1) % count
      indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1)
    }
    const geometry = this.own(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const material = this.mat({ vertexColors: true, roughness: 0.62, metalness: 0.02 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    this.root.add(mesh)
    return mesh
  }

  private buildRoad(): void {
    const half = this.def.width / 2
    const asphalt = this.mat({ map: this.asphaltTexture(), color: '#ffffff', roughness: 0.86, metalness: 0.02 })
    this.ribbon(-half, half, 0, asphalt, 9)
    const lineMat = this.mat({ color: '#f8f2e4', roughness: 0.52, metalness: 0.02, emissive: '#171715', emissiveIntensity: 0.12 })
    this.ribbon(-half + 0.34, -half + 0.5, 0.028, lineMat, 7)
    this.ribbon(half - 0.5, half - 0.34, 0.028, lineMat, 7)
    this.curb(-half + 0.52)
    this.curb(half - 0.52)
    // A slightly darker fascia gives the ribbon physical thickness from the chase camera.
    const sideMat = this.mat({ color: '#090b0f', roughness: 0.82 })
    for (const side of [-1, 1]) {
      const lateral = side * (half + 0.02)
      const samples = this.model.samples
      const count = samples.length
      const positions = new Float32Array(count * 2 * 3)
      const indices: number[] = []
      for (let i = 0; i < count; i += 1) {
        const s = samples[i]
        const top = s.pos.clone().addScaledVector(s.right, lateral).addScaledVector(s.normal, 0.02)
        const bottom = s.pos.clone().addScaledVector(s.right, lateral).addScaledVector(s.normal, -0.5)
        positions.set([top.x, top.y, top.z, bottom.x, bottom.y, bottom.z], i * 6)
        const j = (i + 1) % count
        indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1)
      }
      const geometry = this.own(new THREE.BufferGeometry())
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, sideMat)
      mesh.material.side = THREE.DoubleSide
      this.root.add(mesh)
    }
    this.buildStartLine()
  }

  private buildStartLine(): void {
    const s = this.model.sample(0)
    const group = new THREE.Group()
    group.position.copy(s.pos).addScaledVector(s.normal, 0.045)
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.right, s.normal, s.tangent))
    const cols = 12
    const rows = 2
    const cellW = (this.def.width - 1.2) / cols
    const cellD = 0.62
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const dark = (r + c) % 2 === 0
        const material = this.mat({ color: dark ? '#171f20' : '#f8f2e4', roughness: 0.54 })
        const tile = new THREE.Mesh(this.own(new THREE.BoxGeometry(cellW * 0.96, 0.035, cellD)), material)
        tile.position.set((c - (cols - 1) / 2) * cellW, 0, (r - (rows - 1) / 2) * cellD)
        group.add(tile)
      }
    }
    this.root.add(group)
  }

  private buildBarriers(): void {
    const samples = this.model.samples
    const half = this.def.width / 2 + 0.2
    const railMat = this.mat({ color: '#e9e1cf', roughness: 0.62, metalness: 0.05 })
    for (const side of [-1, 1]) {
      const lateral = side * half
      const count = samples.length
      const positions = new Float32Array(count * 2 * 3)
      const indices: number[] = []
      for (let i = 0; i < count; i += 1) {
        const s = samples[i]
        const a = s.pos.clone().addScaledVector(s.right, lateral).addScaledVector(s.normal, 0.06)
        const b = s.pos.clone().addScaledVector(s.right, lateral).addScaledVector(s.normal, 0.72)
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
        const j = (i + 1) % count
        indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1)
      }
      const geo = this.own(new THREE.BufferGeometry())
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setIndex(indices)
      geo.computeVertexNormals()
      railMat.side = THREE.DoubleSide
      this.root.add(new THREE.Mesh(geo, railMat))
    }

    const step = 7
    const count = Math.floor(samples.length / step)
    const plateGeo = this.own(new THREE.BoxGeometry(1, 0.46, 0.11))
    const plateMat = this.mat({ color: '#ffffff', roughness: 0.55, metalness: 0.04 })
    const plates = new THREE.InstancedMesh(plateGeo, plateMat, count * 2)
    plates.castShadow = false
    plates.receiveShadow = true
    const postGeo = this.own(new THREE.BoxGeometry(0.16, 0.92, 0.16))
    const posts = new THREE.InstancedMesh(postGeo, railMat, Math.ceil(count * 2 / 2))
    const dummy = new THREE.Object3D()
    const coral = new THREE.Color(this.def.accent)
    const cream = new THREE.Color('#f7f1e4')
    let pi = 0
    for (let i = 0; i < count; i += 1) {
      const s = samples[i * step]
      const s2 = samples[((i + 1) * step) % samples.length]
      const length = s.pos.distanceTo(s2.pos) * 1.12
      const tangent = s2.pos.clone().sub(s.pos).normalize()
      const basis = new THREE.Matrix4().makeBasis(tangent, s.normal, tangent.clone().cross(s.normal))
      for (const side of [-1, 1]) {
        const edge = side * half
        dummy.position.copy(s.pos).addScaledVector(s.right, edge).addScaledVector(s.normal, 0.47)
        dummy.quaternion.setFromRotationMatrix(basis)
        dummy.scale.set(length, 1, 1)
        dummy.updateMatrix()
        plates.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), dummy.matrix)
        plates.setColorAt(i * 2 + (side > 0 ? 1 : 0), Math.floor(i / 3) % 2 === 0 ? coral : cream)
      }
      if (i % 2 === 0) {
        dummy.position.copy(s.pos).addScaledVector(s.right, half).addScaledVector(s.normal, 0.42)
        dummy.quaternion.setFromRotationMatrix(basis)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        posts.setMatrixAt(pi++, dummy.matrix)
        dummy.position.copy(s.pos).addScaledVector(s.right, -half).addScaledVector(s.normal, 0.42)
        dummy.updateMatrix()
        posts.setMatrixAt(pi++, dummy.matrix)
      }
    }
    plates.instanceMatrix.needsUpdate = true
    if (plates.instanceColor) plates.instanceColor.needsUpdate = true
    posts.count = pi
    posts.instanceMatrix.needsUpdate = true
    this.root.add(plates, posts)
  }

  private buildSupports(): void {
    const samples = this.model.samples
    const step = 24
    const entries: TrackSample[] = []
    for (let i = 0; i < samples.length; i += step) entries.push(samples[i])
    const geo = this.own(new THREE.BoxGeometry(1, 1, 1))
    const mat = this.mat({ color: this.def.theme === 'vault' ? '#495b58' : '#4b4b46', roughness: 0.86 })
    const supports = new THREE.InstancedMesh(geo, mat, entries.length * (this.def.wallRide ? 2 : 1))
    const dummy = new THREE.Object3D()
    let index = 0
    for (const s of entries) {
      const base = s.pos.clone().addScaledVector(s.normal, -0.5)
      const height = base.y - this.groundY
      if (height > 0.8) {
        dummy.position.set(base.x, this.groundY + height / 2, base.z)
        dummy.quaternion.identity()
        dummy.scale.set(1.4, height, 1.4)
        dummy.updateMatrix()
        supports.setMatrixAt(index++, dummy.matrix)
      }
      if (this.def.wallRide && wallRideAt(this.def, s.distance / this.model.length)) {
        const high = s.pos.clone().addScaledVector(s.right, this.def.width / 2 - 0.4).addScaledVector(s.normal, -0.5)
        const h = high.y - this.groundY
        if (h > 1) {
          dummy.position.set(high.x, this.groundY + h / 2, high.z)
          dummy.scale.set(1.8, h, 1.8)
          dummy.updateMatrix()
          supports.setMatrixAt(index++, dummy.matrix)
        }
      }
    }
    supports.count = index
    supports.instanceMatrix.needsUpdate = true
    supports.castShadow = true
    supports.receiveShadow = true
    this.root.add(supports)
  }

  private signTexture(title: string, subtitle: string, accent: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 320
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#162426'
    ctx.fillRect(0, 0, 1024, 320)
    ctx.fillStyle = accent
    ctx.fillRect(0, 0, 18, 320)
    ctx.fillRect(0, 272, 1024, 14)
    ctx.font = '900 104px ManusCC0, sans-serif'
    ctx.fillStyle = '#f7f1e4'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(title, 58, 144)
    ctx.font = '700 31px ManusCC0, sans-serif'
    ctx.fillStyle = accent
    ctx.fillText(subtitle, 62, 232)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return this.own(texture)
  }

  private buildStartGantry(): void {
    const s = this.model.sample(0)
    const group = new THREE.Group()
    group.position.copy(s.pos)
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.right, s.normal, s.tangent))
    const half = this.def.width / 2 + 1.3
    const beamMat = this.mat({ color: '#1b2527', roughness: 0.6, metalness: 0.15 })
    const accentMat = this.mat({ color: this.def.accent, roughness: 0.52, metalness: 0.12 })
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.42, 7.4, 0.42)), beamMat)
      post.position.set(side * half, 3.7, 0)
      post.castShadow = true
      group.add(post)
      const foot = new THREE.Mesh(this.own(new THREE.BoxGeometry(1.4, 0.4, 1.4)), accentMat)
      foot.position.set(side * half, 0.2, 0)
      group.add(foot)
    }
    const beam = new THREE.Mesh(this.own(new THREE.BoxGeometry(half * 2 + 0.7, 0.55, 0.55)), beamMat)
    beam.position.y = 7.2
    beam.castShadow = true
    group.add(beam)
    const texture = this.signTexture(this.def.name.toUpperCase(), `${this.def.number}  //  ${this.def.subtitle}`, this.def.accent)
    const signMat = this.mat({ map: texture, color: '#ffffff', roughness: 0.55, emissive: '#131313', emissiveIntensity: 0.2 })
    const sign = new THREE.Mesh(this.own(new THREE.PlaneGeometry(6.8, 2.1)), signMat)
    sign.position.set(0, 5.95, 0.32)
    group.add(sign)
    const back = sign.clone()
    back.rotation.y = Math.PI
    back.position.z = -0.32
    group.add(back)
    this.root.add(group)
  }

  private chevronTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 512, 256)
    ctx.fillStyle = this.def.accent
    for (let i = 0; i < 3; i += 1) {
      const x = 70 + i * 145
      ctx.beginPath()
      ctx.moveTo(x, 54)
      ctx.lineTo(x + 82, 128)
      ctx.lineTo(x, 202)
      ctx.lineTo(x + 40, 202)
      ctx.lineTo(x + 122, 128)
      ctx.lineTo(x + 40, 54)
      ctx.closePath()
      ctx.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return this.own(texture)
  }

  private buildRamps(): void {
    const chevrons = this.chevronTexture()
    const chevronMat = this.mat({ map: chevrons, transparent: true, roughness: 0.58, emissive: this.def.accent, emissiveIntensity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    for (const ramp of this.def.ramps) {
      const s = this.model.sample(ramp.at - ramp.length * 0.42)
      const decal = new THREE.Mesh(this.own(new THREE.PlaneGeometry(this.def.width - 2.6, 3.6)), chevronMat)
      decal.geometry.rotateX(-Math.PI / 2)
      decal.position.copy(s.pos).addScaledVector(s.normal, 0.055)
      decal.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.right, s.normal, s.tangent))
      decal.renderOrder = 3
      this.root.add(decal)
      const lip = this.model.sample(ramp.at + ramp.length * 0.04)
      const lipMat = this.mat({ color: this.def.accent, roughness: 0.46, metalness: 0.04, emissive: this.def.accent, emissiveIntensity: 0.16 })
      const lipMesh = new THREE.Mesh(this.own(new THREE.BoxGeometry(this.def.width - 0.6, 0.15, 0.34)), lipMat)
      lipMesh.position.copy(lip.pos).addScaledVector(lip.normal, 0.08)
      lipMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lip.right, lip.normal, lip.tangent))
      this.root.add(lipMesh)
    }
  }

  private buildWallRide(): void {
    const spec = this.def.wallRide!
    const start = this.model.sample(spec.from)
    const group = new THREE.Group()
    group.position.copy(start.pos)
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(start.right, start.normal, start.tangent))
    const half = this.def.width / 2 + 1
    const beamMat = this.mat({ color: '#080b10', roughness: 0.5, metalness: 0.28 })
    const accentMat = this.mat({ color: this.def.secondary, emissive: this.def.secondary, emissiveIntensity: 0.65, roughness: 0.4 })
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.46, 10.5, 0.46)), beamMat)
      post.position.set(side * half, 5.2, 0)
      post.castShadow = true
      group.add(post)
    }
    const beam = new THREE.Mesh(this.own(new THREE.BoxGeometry(half * 2 + 0.8, 0.48, 0.48)), accentMat)
    beam.position.y = 10.1
    group.add(beam)
    const texture = this.signTexture('WALL RIDE', 'HOLD SPEED  //  TRUST THE BANK', this.def.secondary)
    const signMat = this.mat({ map: texture, color: '#ffffff', roughness: 0.5, emissive: this.def.secondary, emissiveIntensity: 0.12 })
    const sign = new THREE.Mesh(this.own(new THREE.PlaneGeometry(6.7, 2.08)), signMat)
    sign.position.set(0, 8.75, 0.3)
    group.add(sign)
    const back = sign.clone()
    back.rotation.y = Math.PI
    back.position.z = -0.3
    group.add(back)
    this.root.add(group)

    // The long upper-side light rail makes the vertical section legible before the car reaches it.
    const samples = this.model.samples
    const indexes: number[] = []
    for (let i = 0; i < samples.length; i += 1) {
      if (wallRideAt(this.def, samples[i].distance / this.model.length)) indexes.push(i)
    }
    if (indexes.length > 2) {
      const positions = new Float32Array(indexes.length * 2 * 3)
      const indices: number[] = []
      for (let k = 0; k < indexes.length; k += 1) {
        const s = samples[indexes[k]]
        const a = s.pos.clone().addScaledVector(s.right, this.def.width / 2 + 0.08).addScaledVector(s.normal, 0.2)
        const b = s.pos.clone().addScaledVector(s.right, this.def.width / 2 + 0.08).addScaledVector(s.normal, 0.82)
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6)
        if (k < indexes.length - 1) indices.push(k * 2, (k + 1) * 2, k * 2 + 1, (k + 1) * 2, (k + 1) * 2 + 1, k * 2 + 1)
      }
      const geo = this.own(new THREE.BufferGeometry())
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setIndex(indices)
      geo.computeVertexNormals()
      const rail = new THREE.Mesh(geo, accentMat)
      this.root.add(rail)
    }
  }

  private buildGrandstand(sample: TrackSample, side: 1 | -1): void {
    const group = new THREE.Group()
    const offset = side * (this.def.width / 2 + 14)
    group.position.copy(sample.pos).addScaledVector(sample.right, offset)
    const basis = new THREE.Matrix4().makeBasis(sample.tangent, new THREE.Vector3(0, 1, 0), sample.tangent.clone().cross(new THREE.Vector3(0, 1, 0)))
    group.quaternion.setFromRotationMatrix(basis)
    const cream = this.mat({ color: '#e9e1cf', roughness: 0.78 })
    const dark = this.mat({ color: '#2b3d3e', roughness: 0.78 })
    const accent = this.mat({ color: this.def.accent, roughness: 0.58 })
    const base = new THREE.Mesh(this.own(new THREE.BoxGeometry(32, 2.2, 10)), cream)
    base.position.y = 1.1
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)
    const rows = 6
    const crowdPositions: THREE.Vector3[] = []
    for (let row = 0; row < rows; row += 1) {
      const step = new THREE.Mesh(this.own(new THREE.BoxGeometry(32, 0.7, 1.35)), row % 2 ? cream : dark)
      step.position.set(0, 2.2 + row * 0.7, -4.2 + row * 1.35)
      step.castShadow = true
      step.receiveShadow = true
      group.add(step)
      for (let c = 0; c < 16; c += 1) {
        if ((c + row * 3) % 5 === 0) continue
        crowdPositions.push(new THREE.Vector3(-14 + c * 1.86, 2.72 + row * 0.7, -4.2 + row * 1.35))
      }
    }
    const roof = new THREE.Mesh(this.own(new THREE.BoxGeometry(34, 0.4, 12)), accent)
    roof.position.set(0, 7.25, 0.3)
    roof.rotation.z = -0.025
    roof.castShadow = true
    group.add(roof)
    for (const x of [-15.2, 15.2]) {
      const post = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.3, 7, 0.3)), dark)
      post.position.set(x, 3.6, 0)
      group.add(post)
    }
    const crowdGeo = this.own(new THREE.BoxGeometry(0.34, 0.42, 0.34))
    const crowdMat = this.mat({ color: '#ffffff', roughness: 0.72 })
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdPositions.length)
    const colors = ['#ff6b35', '#7ee0c2', '#ffd45e', '#f7f1e4', '#253a3d']
    const dummy = new THREE.Object3D()
    crowdPositions.forEach((p, i) => {
      dummy.position.copy(p)
      dummy.rotation.set(0, (i % 4) * 0.4, 0)
      dummy.updateMatrix()
      crowd.setMatrixAt(i, dummy.matrix)
      crowd.setColorAt(i, new THREE.Color(colors[i % colors.length]))
    })
    crowd.instanceMatrix.needsUpdate = true
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true
    group.add(crowd)
    this.root.add(group)
  }

  private nearTrack(x: number, z: number, radius = 13): boolean {
    const r2 = radius * radius
    for (let i = 0; i < this.model.samples.length; i += 7) {
      const p = this.model.samples[i].pos
      const dx = p.x - x
      const dz = p.z - z
      if (dx * dx + dz * dz < r2) return true
    }
    return false
  }

  private scatter(rng: RNG, count: number, min: number, max: number, _radius: number, place: (x: number, z: number) => void): void {
    let attempts = 0
    let placed = 0
    while (placed < count && attempts < count * 18) {
      attempts += 1
      const x = (rng() * 2 - 1) * max
      const z = (rng() * 2 - 1) * max
      if (this.nearTrack(x, z, min)) continue
      if (Math.hypot(x, z) > max) continue
      place(x, z)
      placed += 1
    }
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, cast = true): THREE.Mesh {
    const mesh = new THREE.Mesh(this.own(new THREE.BoxGeometry(w, h, d)), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    this.root.add(mesh)
    return mesh
  }

  private buildHarborScenery(rng: RNG): void {
    const containerMats = ['#ff6b35', '#277f83', '#e8bf56', '#d9d1bd'].map(color => this.mat({ color, roughness: 0.7, metalness: 0.08 }))
    this.scatter(rng, 34, 18, 235, 0, (x, z) => {
      const w = 6 + rng() * 9
      const h = 2.8 + rng() * 1.2
      const d = 2.7 + rng() * 1.1
      const b = this.box(x, this.groundY + h / 2, z, w, h, d, containerMats[Math.floor(rng() * containerMats.length)])
      b.rotation.y = rng() > 0.5 ? 0 : Math.PI / 2
    })
    const metal = this.mat({ color: '#465758', roughness: 0.55, metalness: 0.35 })
    for (let i = 0; i < 5; i += 1) {
      const x = 155 + i * 34
      const z = -160 + i * 80
      this.box(x, this.groundY + 13, z, 1.6, 26, 1.6, metal)
      this.box(x, this.groundY + 25, z + 8, 1.1, 1.1, 20, metal)
      this.box(x, this.groundY + 18, z + 16, 0.8, 14, 0.8, metal)
    }
    const warehouse = this.mat({ color: '#d9d0bb', roughness: 0.8 })
    for (let i = 0; i < 5; i += 1) {
      const x = -180 + i * 85
      const z = 185 + (i % 2) * 42
      this.box(x, this.groundY + 7, z, 46, 14, 24, warehouse)
    }
    const trunk = this.mat({ color: '#8d5c3a', roughness: 0.92 })
    const leaf = this.mat({ color: '#3d806d', roughness: 0.78, flatShading: true })
    this.scatter(rng, 22, 16, 245, 0, (x, z) => {
      const height = 5 + rng() * 5
      const t = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.24, 0.38, height, 6)), trunk)
      t.position.set(x, this.groundY + height / 2, z)
      this.root.add(t)
      for (let k = 0; k < 5; k += 1) {
        const crown = new THREE.Mesh(this.own(new THREE.ConeGeometry(2.3, 1.1, 5)), leaf)
        crown.position.set(x, this.groundY + height + 0.2, z)
        crown.rotation.z = Math.PI * 0.36
        crown.rotation.y = (k / 5) * Math.PI * 2
        crown.position.x += Math.cos((k / 5) * Math.PI * 2) * 1.1
        crown.position.z += Math.sin((k / 5) * Math.PI * 2) * 1.1
        this.root.add(crown)
      }
    })
  }

  private buildCanyonScenery(rng: RNG): void {
    const rockMats = ['#9e553c', '#b66645', '#c97850', '#8a4b3a'].map(color => this.mat({ color, roughness: 0.96, flatShading: true }))
    this.scatter(rng, 26, 28, 300, 0, (x, z) => {
      const height = 18 + rng() * 46
      const radius = 7 + rng() * 18
      const mesa = new THREE.Mesh(this.own(new THREE.CylinderGeometry(radius * 0.72, radius, height, 6, 2)), rockMats[Math.floor(rng() * rockMats.length)])
      mesa.position.set(x, this.groundY + height / 2, z)
      mesa.rotation.y = rng() * Math.PI
      mesa.castShadow = true
      mesa.receiveShadow = true
      this.root.add(mesa)
      if (rng() > 0.4) {
        const cap = new THREE.Mesh(this.own(new THREE.CylinderGeometry(radius * 0.55, radius * 0.72, 3, 6)), rockMats[Math.floor(rng() * rockMats.length)])
        cap.position.set(x, this.groundY + height + 1.5, z)
        this.root.add(cap)
      }
    })
    const cactus = this.mat({ color: '#4d7459', roughness: 0.88, flatShading: true })
    this.scatter(rng, 38, 13, 230, 0, (x, z) => {
      const h = 2.4 + rng() * 4
      const stem = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.3, 0.4, h, 6)), cactus)
      stem.position.set(x, this.groundY + h / 2, z)
      stem.castShadow = true
      this.root.add(stem)
      if (rng() > 0.35) {
        const arm = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.18, 0.22, h * 0.55, 5)), cactus)
        arm.position.set(x + 0.55, this.groundY + h * 0.55, z)
        arm.rotation.z = Math.PI / 2.7
        this.root.add(arm)
      }
    })
    const boulderMat = this.mat({ color: '#7c4538', roughness: 1, flatShading: true })
    this.scatter(rng, 42, 10, 210, 0, (x, z) => {
      const r = 1.2 + rng() * 4.8
      const rock = new THREE.Mesh(this.own(new THREE.DodecahedronGeometry(r, 0)), boulderMat)
      rock.position.set(x, this.groundY + r * 0.7, z)
      rock.rotation.set(rng(), rng() * 6, rng())
      rock.castShadow = true
      this.root.add(rock)
    })
  }

  private buildVaultScenery(rng: RNG): void {
    const tower = this.mat({ color: '#c7d4ce', roughness: 0.6, metalness: 0.18 })
    const glass = this.mat({ color: '#4b8c91', roughness: 0.32, metalness: 0.46 })
    this.scatter(rng, 24, 35, 290, 0, (x, z) => {
      const h = 18 + rng() * 65
      const w = 8 + rng() * 12
      const d = 8 + rng() * 14
      const b = this.box(x, this.groundY + h / 2, z, w, h, d, rng() > 0.45 ? glass : tower)
      b.rotation.y = rng() * 0.2
      if (rng() > 0.6) this.box(x, this.groundY + h + 2, z, w * 0.65, 4, d * 0.65, this.mat({ color: this.def.accent, roughness: 0.45 }), false)
    })
    const pylonMat = this.mat({ color: '#e8e1d2', roughness: 0.55 })
    const lightMat = this.mat({ color: this.def.secondary, emissive: this.def.secondary, emissiveIntensity: 1.6, roughness: 0.4 })
    const samples = this.model.samples
    for (let i = 0; i < samples.length; i += 90) {
      const s = samples[i]
      for (const side of [-1, 1]) {
        const p = s.pos.clone().addScaledVector(s.right, side * (this.def.width / 2 + 8))
        this.box(p.x, this.groundY + 9, p.z, 0.45, 18, 0.45, pylonMat)
        const lamp = this.box(p.x, this.groundY + 18.2, p.z, 2.4, 0.7, 0.7, lightMat, false)
        lamp.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      }
    }
    // A handful of grandstands make the wall ride feel like an arena feature.
    for (const t of [0.22, 0.53, 0.82]) {
      const s = this.model.sample(t)
      this.buildGrandstand(s, t > 0.4 ? -1 : 1)
    }
  }

  private buildScenery(): void {
    const rng = makeRng(this.def.id.charCodeAt(0) * 911 + 57)
    if (this.def.theme === 'harbor') this.buildHarborScenery(rng)
    else if (this.def.theme === 'canyon') this.buildCanyonScenery(rng)
    else this.buildVaultScenery(rng)
  }

  private buildClouds(): void {
    const cloudMat = this.mat({ color: '#f8f4e9', roughness: 1, transparent: true, opacity: 0.86, flatShading: true })
    const rng = makeRng(233 + this.def.id.length)
    for (let i = 0; i < 9; i += 1) {
      const group = new THREE.Group()
      const x = (rng() * 2 - 1) * 400
      const z = (rng() * 2 - 1) * 400
      const y = 85 + rng() * 65
      group.position.set(x, y, z)
      for (let k = 0; k < 4; k += 1) {
        const puff = new THREE.Mesh(this.own(new THREE.IcosahedronGeometry(7 + rng() * 11, 0)), cloudMat)
        puff.position.set((k - 1.5) * 12, rng() * 4, rng() * 6)
        puff.scale.y = 0.6
        group.add(puff)
      }
      this.root.add(group)
    }
  }

  update(frameSeconds: number): void {
    this.time += frameSeconds
    if (this.water && !this.reducedMotion) {
      this.water.position.y = this.groundY + 0.16 + Math.sin(this.time * 0.6) * 0.035
    }
  }

  dispose(): void {
    this.scene.remove(this.root)
    this.scene.fog = null
    for (const item of this.disposables) {
      try { item.dispose() } catch { /* already disposed by a shared owner */ }
    }
    this.disposables = []
  }
}

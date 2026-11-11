import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'run'
type Control = {
  id: string
  type: 'number'
  category: string
  label: string
  description: string
  unit: string
  default: number
  min: number
  max: number
  step: number
  applyMode: Mode
  integrity: 'COSMETIC' | 'GAMEPLAY'
}
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []

function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string, category: string, boundary?: Boundary): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({
    control: Object.freeze({
      id: `${section}.${key}`,
      type: 'number',
      category,
      label,
      description: boundary ? 'Applies when the next race starts.' : 'Updates this preview immediately.',
      unit,
      default: defaults[key],
      min,
      max,
      step,
      applyMode: boundary ? 'NEXT_RUN' : 'LIVE',
      integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY',
    }),
    boundary,
    read: () => values[key],
    write: value => { values[key] = value },
  })
}

number('car', 'maxSpeed', 'Top speed', 35, 90, 1, 'm/s', 'Car', 'run')
number('car', 'acceleration', 'Acceleration', 10, 45, 1, 'm/s²', 'Car', 'run')
number('car', 'steerSpeed', 'Steering authority', 6, 20, 0.5, 'm/s', 'Car', 'run')
number('car', 'steerGrip', 'Lateral grip', 3, 16, 0.5, '', 'Car', 'run')
number('car', 'driftGrip', 'Drift grip', 1, 8, 0.1, '', 'Car', 'run')
number('car', 'boostTime', 'Boost duration', 0.5, 3, 0.05, 's', 'Car', 'run')
number('car', 'rampMinSpeed', 'Ramp launch threshold', 10, 35, 1, 'm/s', 'Car', 'run')
number('camera', 'distance', 'Chase distance', 4, 14, 0.2, 'm', 'Camera')
number('camera', 'height', 'Chase height', 1.2, 6, 0.1, 'm', 'Camera')
number('camera', 'fov', 'Base field of view', 45, 90, 1, '°', 'Camera')
number('run', 'countdown', 'Start countdown', 0, 5, 0.2, 's', 'Race', 'run')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return {
      requested: { ...requested },
      active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])),
    }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    requested = { ...requested, ...patch }
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) {
      if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    }
    unranked = gameplayModified()
  },
}

/**
 * Unified driving input for keyboard, gamepad and touch. Gameplay reads `move` (x steer, y
 * throttle) plus `held()`/`consume()`; it never checks raw key codes.
 */
export type Action = 'drift' | 'boost' | 'pause' | 'confirm' | 'back'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  drift: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight', 'KeyF'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  back: [],
}
const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
}

/** Positive steering is right: D/Right; negative steering is left: A/Left. */
export function keyboardSteer(isDown: (code: string) => boolean): number {
  return (MOVE_KEYS.right.some(isDown) ? 1 : 0) - (MOVE_KEYS.left.some(isDown) ? 1 : 0)
}
const PAD_BINDINGS: Record<Action, number[]> = {
  drift: [0, 5],
  boost: [2, 7],
  pause: [9],
  confirm: [0],
  back: [1],
}

export class Input {
  /** x = steer right, y = throttle forward. Both in [-1, 1]. */
  readonly move = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  private keys = new Set<string>()
  private held_ = new Set<Action>()
  private pressed_ = new Set<Action>()
  private touchMove = { x: 0, y: 0 }
  private touchButtons = new Set<Action>()
  private padPrev: boolean[] = []
  private padIndex = -1
  private padId = ''
  private listeners: Array<() => void> = []

  constructor() {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', e => {
      if (e.repeat) return
      this.keys.add(e.code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
        if (codes.includes(e.code)) this.pressed_.add(action)
      }
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea, select')
      if (!typing && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault()
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => this.keys.clear())
    on(window, 'gamepaddisconnected', e => {
      if (e.gamepad.index === this.padIndex) this.resetPad()
    })
  }

  setTouchMove(x: number, y: number): void {
    this.method = 'touch'
    this.touchMove.x = Math.max(-1, Math.min(1, x))
    this.touchMove.y = Math.max(-1, Math.min(1, y))
  }

  setTouchButton(action: Action, down: boolean): void {
    this.method = 'touch'
    if (down && !this.touchButtons.has(action)) this.pressed_.add(action)
    if (down) this.touchButtons.add(action)
    else this.touchButtons.delete(action)
  }

  private resetPad(): void {
    this.padPrev = []
    this.padIndex = -1
    this.padId = ''
  }

  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let x = keyboardSteer(code => k([code]))
    let y = (k(MOVE_KEYS.up) ? 1 : 0) - (k(MOVE_KEYS.down) ? 1 : 0)
    this.held_.clear()
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
      if (k(codes)) this.held_.add(action)
    }
    for (const action of this.touchButtons) this.held_.add(action)
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      x = this.touchMove.x
      y = this.touchMove.y
    }
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (pad) {
      if (pad.index !== this.padIndex || pad.id !== this.padId) this.padPrev = []
      this.padIndex = pad.index
      this.padId = pad.id
      const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : v)
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
      const dy = (pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0)
      if (lx || ly || dx || dy || pad.buttons.some(b => b.pressed)) this.method = 'gamepad'
      if (lx || ly || dx || dy) {
        x = dx || lx
        y = dy || -ly
      }
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) {
        if (buttons.some(i => pad.buttons[i]?.pressed)) this.held_.add(action)
        if (buttons.some(i => pad.buttons[i]?.pressed && !this.padPrev[i])) this.pressed_.add(action)
      }
      this.padPrev = pad.buttons.map(b => b.pressed)
    } else this.resetPad()
    const len = Math.hypot(x, y)
    this.move.x = len > 1 ? x / len : x
    this.move.y = len > 1 ? y / len : y
  }

  held(action: Action): boolean {
    return this.held_.has(action)
  }

  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }

  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  endFrame(): void {
    this.pressed_.clear()
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}

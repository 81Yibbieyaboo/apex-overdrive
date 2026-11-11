import type { Input } from '../engine/input'

/** On-screen steering, throttle, drift and boost for coarse-pointer devices. */
export class TouchControls {
  private steer = 0
  private throttle = 0
  private listeners: Array<() => void> = []
  private readonly buttons: HTMLElement[]

  constructor(
    root: HTMLElement,
    private readonly input: Input,
    private readonly isPlaying: () => boolean,
  ) {
    this.buttons = [...root.querySelectorAll<HTMLElement>('[data-touch-steer], [data-touch-throttle], [data-touch-action]')]
    this.bind()
    root.classList.toggle('has-touch', matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  }

  private bind(): void {
    for (const button of this.buttons) {
      const down = (event: PointerEvent) => {
        if (!this.isPlaying()) return
        event.preventDefault()
        event.stopPropagation()
        button.setPointerCapture?.(event.pointerId)
        button.classList.add('is-pressed')
        this.apply(button, true)
      }
      const up = (event: PointerEvent) => {
        event.preventDefault()
        button.classList.remove('is-pressed')
        this.apply(button, false)
      }
      button.addEventListener('pointerdown', down)
      button.addEventListener('pointerup', up)
      button.addEventListener('pointercancel', up)
      button.addEventListener('lostpointercapture', up)
      this.listeners.push(() => {
        button.removeEventListener('pointerdown', down)
        button.removeEventListener('pointerup', up)
        button.removeEventListener('pointercancel', up)
        button.removeEventListener('lostpointercapture', up)
      })
    }
  }

  private apply(button: HTMLElement, down: boolean): void {
    if (button.dataset.touchSteer) {
      const dir = button.dataset.touchSteer === 'left' ? -1 : 1
      this.steer = down ? dir : 0
      for (const b of this.buttons) {
        if (b.dataset.touchSteer && b !== button) b.classList.remove('is-pressed')
      }
    } else if (button.dataset.touchThrottle) {
      const value = Number(button.dataset.touchThrottle)
      this.throttle = down ? value : 0
      for (const b of this.buttons) {
        if (b.dataset.touchThrottle && b !== button) b.classList.remove('is-pressed')
      }
    } else if (button.dataset.touchAction) {
      const action = button.dataset.touchAction === 'drift' ? 'drift' : 'boost'
      this.input.setTouchButton(action, down)
    }
    this.input.setTouchMove(this.steer, this.throttle)
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}

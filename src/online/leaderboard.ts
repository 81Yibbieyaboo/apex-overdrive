import type { BoardEntry, BoardView } from '../ui/ui'
import type { TrackId } from '../game/tracks'

const API = '/api/leaderboards/v1'
const GUEST_KEY = 'apex-overdrive.guest.v1'
const PROTOCOL_VERSION = 1
const RULES_VERSION = 'v1'
const BOARD_BY_TRACK: Record<TrackId, string> = {
  harbor: 'harbor-race-v1',
  canyon: 'canyon-race-v1',
  vault: 'vault-race-v1',
}
const TRACK_BY_BOARD: Record<string, TrackId> = {
  'harbor-race-v1': 'harbor',
  'canyon-race-v1': 'canyon',
  'vault-race-v1': 'vault',
}

export type Ticket = { runId: string; track: TrackId; boardId: string; issuedAt: number }
export type SubmitOutcome = { accepted: boolean; rank?: number }

class OnlineError extends Error {
  constructor(readonly code: string, readonly status = 0) {
    super(code)
  }
}

function guestStorage(): { token: string; name: string } | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (typeof value?.token === 'string' && typeof value?.name === 'string') return value
  } catch { /* storage may be disabled */ }
  return null
}

function cleanName(name: string): string {
  return [...name.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 20).join('') || 'APEX DRIVER'
}

export class Online {
  private token: string | null = null
  private name = ''
  private guestPromise: Promise<void> | null = null
  private currentTicket: Ticket | null = null
  status: 'idle' | 'connecting' | 'ready' | 'offline' = 'idle'

  get boardForTrack(): (track: TrackId) => string {
    return track => BOARD_BY_TRACK[track]
  }

  get hasTicket(): boolean {
    return this.currentTicket !== null
  }

  async init(displayName: string): Promise<void> {
    this.status = 'connecting'
    this.name = cleanName(displayName)
    const stored = guestStorage()
    if (stored && stored.name === this.name) this.token = stored.token
    try {
      if (!this.token) await this.createGuest()
      // A lightweight public read proves the API is reachable before the title reports ready.
      await this.request(`/boards/${BOARD_BY_TRACK.harbor}?limit=1`, { method: 'GET', auth: Boolean(this.token) })
      this.status = 'ready'
    } catch {
      this.status = 'offline'
    }
  }

  async setName(displayName: string): Promise<void> {
    const next = cleanName(displayName)
    if (next === this.name) return
    this.name = next
    this.token = null
    this.status = 'connecting'
    try {
      await this.createGuest()
      this.status = 'ready'
    } catch {
      this.status = 'offline'
    }
  }

  private createGuest(): Promise<void> {
    if (this.guestPromise) return this.guestPromise
    this.guestPromise = (async () => {
      const data = await this.request('/guests', {
        method: 'POST',
        body: { displayName: this.name },
        auth: false,
      }) as { token?: unknown }
      if (typeof data?.token !== 'string') throw new OnlineError('guest_token_missing')
      this.token = data.token
      try { localStorage.setItem(GUEST_KEY, JSON.stringify({ token: this.token, name: this.name })) } catch { /* private mode */ }
    })().finally(() => { this.guestPromise = null })
    return this.guestPromise
  }

  private async ensureGuest(): Promise<void> {
    if (!this.token) await this.createGuest()
  }

  private async request(path: string, options: { method: string; body?: unknown; auth?: boolean; retryAuth?: boolean }): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.auth !== false && this.token) {
      headers.Authorization = `Bearer ${this.token}`
      headers['X-Guest-Token'] = this.token
    }
    let response: Response
    try {
      response = await fetch(`${API}${path}`, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'same-origin',
        cache: 'no-store',
      })
    } catch {
      throw new OnlineError('network_unavailable')
    }
    let data: unknown = null
    try { data = await response.json() } catch { /* non-JSON edge */ }
    if (!response.ok) {
      const code = typeof (data as { error?: unknown })?.error === 'string' ? (data as { error: string }).error : `http_${response.status}`
      if (response.status === 401 && options.retryAuth !== false && options.auth !== false) {
        this.token = null
        await this.createGuest()
        return this.request(path, { ...options, retryAuth: false })
      }
      throw new OnlineError(code, response.status)
    }
    return data
  }

  async beginRun(track: TrackId): Promise<Ticket> {
    await this.ensureGuest()
    const boardId = BOARD_BY_TRACK[track]
    const data = await this.request(`/boards/${boardId}/runs`, {
      method: 'POST',
      body: { protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION },
    }) as { runId?: unknown }
    if (typeof data?.runId !== 'string') throw new OnlineError('run_ticket_missing')
    const ticket: Ticket = { runId: data.runId, track, boardId, issuedAt: Date.now() }
    this.currentTicket = ticket
    this.status = 'ready'
    return ticket
  }

  async submit(track: TrackId, totalMs: number): Promise<SubmitOutcome> {
    const ticket = this.currentTicket
    if (!ticket || ticket.track !== track) throw new OnlineError('no_active_run_ticket')
    await this.request(`/runs/${ticket.runId}`, {
      method: 'PUT',
      body: { score: Math.round(totalMs), durationMs: Math.round(totalMs) },
    })
    let rank: number | undefined
    try {
      const board = await this.list(track)
      rank = board.myRank
    } catch { /* acceptance is enough if the rank read races with the write */ }
    this.currentTicket = null
    return { accepted: true, rank }
  }

  async list(track: TrackId): Promise<BoardView & { myRank?: number }> {
    const boardId = BOARD_BY_TRACK[track]
    try {
      const data = await this.request(`/boards/${boardId}?limit=20`, { method: 'GET', auth: Boolean(this.token) }) as {
        entries?: Array<{ rank?: unknown; displayName?: unknown; score?: unknown; playerId?: unknown }>
        myRank?: { rank?: unknown; score?: unknown } | null
      }
      const entries: BoardEntry[] = (data.entries ?? []).map((entry, index) => ({
        rank: Number(entry.rank) || index + 1,
        name: typeof entry.displayName === 'string' ? entry.displayName : 'GUEST',
        timeMs: Number(entry.score) || 0,
        isMe: false,
      }))
      this.status = 'ready'
      const myRank = data.myRank?.rank !== undefined ? Number(data.myRank.rank) : undefined
      if (myRank) {
        const own = data.myRank?.score !== undefined ? Number(data.myRank.score) : null
        for (const entry of entries) if (entry.rank === myRank && own !== null && entry.timeMs === own) entry.isMe = true
      }
      return { entries, myRank }
    } catch (error) {
      const err = error as OnlineError
      return { entries: [], error: err.code ?? 'network_unavailable' }
    }
  }

  async retryable(track: TrackId, totalMs: number): Promise<SubmitOutcome> {
    return this.submit(track, totalMs)
  }

  clearRun(): void {
    this.currentTicket = null
  }

  boardId(track: TrackId): string {
    return BOARD_BY_TRACK[track]
  }
}

export { TRACK_BY_BOARD }

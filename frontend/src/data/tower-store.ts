import { seedTowerState } from '@/data/tower-seed'
import type { DispositionCategory, TowerState } from '@/data/tower-types'

// 判词塔的本地持久化：和主数据分开放，清主数据不会把封牌历史一起抹掉。
const STORAGE_KEY = 'data-layer-studio:tower'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): TowerState {
  const fallback = seedTowerState()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TowerState>
    if (!parsed || !Array.isArray(parsed.towers)) {
      throw new Error('判词塔存档结构不完整')
    }
    return {
      towers: parsed.towers,
      cards: parsed.cards ?? [],
      needles: parsed.needles ?? [],
      dispositions: parsed.dispositions ?? [],
      dispositionSeq: parsed.dispositionSeq ?? 0,
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: TowerState | null = null

export function towerState(): TowerState {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveTowerState(next: TowerState): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetTowerState(): TowerState {
  const rows = clone(seedTowerState())
  saveTowerState(rows)
  return rows
}

export function towerStorageKey(): string {
  return STORAGE_KEY
}

export const DISPOSITION_CATEGORIES: DispositionCategory[] = [
  'ticket_residue',
  'silent_rule',
  'level_drift',
  'cluster_shift',
]

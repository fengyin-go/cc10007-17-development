import { saveTowerState, towerState } from '@/data/tower-store'
import { DISPOSITION_META } from '@/data/tower-seed'
import type {
  BlockLevel,
  DispositionCategory,
  DispositionRecord,
  EvidenceNeedle,
  JudgmentTower,
  ReconcileResult,
  SealOptions,
  SealResult,
  ThresholdPatch,
  TopCardReadModel,
  TowerSlice,
  TowerState,
  Verdict,
  VerdictCard,
} from '@/data/tower-types'

// 判词塔的读写都收在这里：塔层是输入，塔顶牌是裁决，证据针只给清洗加工看。
// 三条硬约束：换阈值只重算未封牌切片；同号同批重放返回原牌；并行争抢只留一个牌根。

const CLUSTER_SEQ_WIDTH = 3
const DISPOSITION_SEQ_WIDTH = 4

function nowLabel(): string {
  const stamp = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`
}

export function findTower(no: string): JudgmentTower | undefined {
  return towerState().towers.find((tower) => tower.towerNo === no)
}

export function listTowers(): JudgmentTower[] {
  return towerState().towers
}

/** 塔顶：按切片顺序最后一个已封牌的切片；没封过牌就没有塔顶牌。 */
function topSlice(tower: JudgmentTower): TowerSlice | undefined {
  return [...tower.slices].reverse().find((slice) => slice.sealed)
}

/** 塔顶牌根：同一座塔每个时间切片只允许一张封牌。 */
function cardRoot(state: TowerState, towerNo: string, sliceKey: string): VerdictCard | undefined {
  return state.cards.find(
    (card) => card.towerNo === towerNo && card.sliceKey === sliceKey && card.status === '已封牌',
  )
}

function cardNoTaken(state: TowerState, cardNo: string): VerdictCard | undefined {
  return state.cards.find((card) => card.cardNo === cardNo)
}

function levelRank(level: BlockLevel): number {
  return level === 'P0-阻断' ? 3 : level === 'P1-扣留' ? 2 : 1
}

function nextClusterNo(state: TowerState): string {
  const prefix = 'CF-'
  let max = 0
  for (const card of state.cards) {
    if (!card.clusterNo.startsWith(prefix)) continue
    const seq = Number(card.clusterNo.slice(prefix.length))
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return `${prefix}${String(max + 1).padStart(CLUSTER_SEQ_WIDTH, '0')}`
}

/** 采样：按比例向下取整但不为零，取切片前 N 行。 */
function sampledRows(tower: JudgmentTower, slice: TowerSlice) {
  const wanted = Math.max(1, Math.floor(slice.rows.length * tower.samplingRate))
  return slice.rows.slice(0, wanted)
}

function isHit(tower: JudgmentTower, value: number): boolean {
  return value < tower.lower || value > tower.upper
}

function verdictForRows(tower: JudgmentTower, rows: { rowNo: number; value: number }[]): Verdict {
  const wanted = Math.max(1, Math.floor(rows.length * tower.samplingRate))
  const sampled = rows.slice(0, wanted)
  if (sampled.every((row) => !isHit(tower, row.value))) return '放行'
  if (tower.blockLevel === 'P2-观察') return '放行'
  return tower.blockLevel === 'P1-扣留' ? '扣留' : '阻断'
}

/** 一片的结论由塔当前参数决定；观察级别只记命中不扣留。 */
export function evaluateSlice(towerNo: string, sliceKey: string): Verdict | undefined {
  const tower = findTower(towerNo)
  const slice = tower?.slices.find((item) => item.sliceKey === sliceKey)
  if (!tower || !slice) return undefined
  return verdictForRows(tower, slice.rows)
}

/**
 * ADS 的只读投影：每座塔只给塔顶一张牌，不带任何证据针。
 * 页面拿到的字段里没有 rowNo / observedValue，想取被扣留行只能走清洗加工。
 */
export function listTopCards(): TopCardReadModel[] {
  const state = towerState()
  return state.towers.flatMap((tower) => {
    const slice = topSlice(tower)
    if (!slice) return []
    const root = cardRoot(state, tower.towerNo, slice.sliceKey)
    if (!root) return []
    return [{
      towerNo: tower.towerNo,
      tableName: tower.tableName,
      targetField: tower.targetField,
      cardNo: root.cardNo,
      clusterNo: root.clusterNo,
      verdict: root.verdict,
      blockLevel: root.blockLevel,
      thresholdVersion: root.thresholdVersion,
      withheldCount: root.withheldCount,
      rootBatchNo: root.rootBatchNo,
      sealedAt: root.sealedAt,
    }]
  })
}

/** 清洗加工读取的口径：只拿正卷里被扣留行的证据针。 */
export function listNeedlesForCleanse(towerNo: string): EvidenceNeedle[] {
  return towerState().needles.filter(
    (needle) => needle.towerNo === towerNo && needle.volume === '正卷',
  )
}

export function listSecondaryNeedles(towerNo: string): EvidenceNeedle[] {
  return towerState().needles.filter(
    (needle) => needle.towerNo === towerNo && needle.volume === '副卷',
  )
}

export function listCards(towerNo?: string): VerdictCard[] {
  const cards = towerState().cards
  return towerNo ? cards.filter((card) => card.towerNo === towerNo) : cards
}

export function listDispositions(): DispositionRecord[] {
  return [...towerState().dispositions].reverse()
}

function buildNeedles(
  tower: JudgmentTower,
  slice: TowerSlice,
  batchNo: string,
  volume: EvidenceNeedle['volume'],
  cardNo: string,
  clusterNo: string,
  rows: { rowNo: number; value: number }[],
): EvidenceNeedle[] {
  // 副卷按批次加后缀，避免多个落败批次共用同一证据针号。
  const suffix = volume === '副卷' ? `-${batchNo.replace(/[^A-Za-z0-9]/g, '')}` : ''
  return rows.map((row, index) => ({
    needleNo: `EZ-${slice.sliceKey}-${volume}${suffix}-${String(index + 1).padStart(2, '0')}`,
    cardNo,
    clusterNo,
    towerNo: tower.towerNo,
    sliceKey: slice.sliceKey,
    targetField: tower.targetField,
    rowNo: row.rowNo,
    observedValue: row.value,
    reason: `${tower.expression}：值 ${row.value} 不在 [${tower.lower}, ${tower.upper}]`,
    batchNo,
    volume,
  }))
}

/**
 * 封牌：只封未封牌的切片。
 * 1) 同号同批重放：原牌原样返回，不重新裁决、不追加证据。
 * 2) 同号异批争抢：牌根不动，本批证据整体进副卷。
 * 3) 首次封牌：落牌根 + 正卷证据，并把切片标成已封，之后不再重算。
 */
export function sealSlice(towerNo: string, sliceKey: string, options: SealOptions = {}): SealResult {
  const state = towerState()
  const tower = state.towers.find((item) => item.towerNo === towerNo)
  const slice = tower?.slices.find((item) => item.sliceKey === sliceKey)
  if (!tower || !slice) {
    return { ok: false, replay: false, message: `没有找到 ${towerNo} 的切片 ${sliceKey}` }
  }

  const existing = cardNoTaken(state, slice.cardNo)
  if (existing) {
    if (existing.rootBatchNo === options.batchNo || !options.batchNo) {
      return {
        ok: true,
        replay: true,
        message: `封牌号 ${slice.cardNo} 已存在，返回原牌（结论「${existing.verdict}」，不重新裁决）`,
        card: existing,
      }
    }
    // 并行计算争抢塔顶：牌根已落，本批证据不进正卷。
    const rivalRows = sampledRows(tower, slice).filter((row) => isHit(tower, row.value))
    const disclose = existing.withheldCount > 0
    const taken = new Set(state.needles.map((needle) => needle.needleNo))
    const secondary = disclose
      ? buildNeedles(tower, slice, options.batchNo, '副卷', existing.cardNo, existing.clusterNo, rivalRows)
          .filter((needle) => !taken.has(needle.needleNo))
      : []
    if (secondary.length === 0 && existing.secondaryBatchNo === options.batchNo) {
      return {
        ok: true,
        replay: true,
        message: `批次 ${options.batchNo} 的副卷证据已经登记过，不重复追加`,
        card: existing,
      }
    }
    const next: TowerState = {
      ...state,
      needles: [...state.needles, ...secondary],
      cards: state.cards.map((card) =>
        card.cardNo === existing.cardNo
          ? { ...card, secondaryBatchNo: card.secondaryBatchNo ?? options.batchNo }
          : card,
      ),
    }
    saveTowerState(next)
    return {
      ok: true,
      replay: false,
      message: `塔顶已有牌根 ${existing.cardNo}（批次 ${existing.rootBatchNo}），本批 ${secondary.length} 条证据转入副卷`,
      card: existing,
    }
  }

  const hits = sampledRows(tower, slice).filter((row) => isHit(tower, row.value))
  const verdict: Verdict =
    hits.length === 0 ? '放行' : tower.blockLevel === 'P2-观察' ? '放行' : tower.blockLevel === 'P1-扣留' ? '扣留' : '阻断'
  const batchNo = options.batchNo?.trim() || `BT-${towerNo.slice(3)}-${slice.label}-${state.cards.length + 1}`
  const card: VerdictCard = {
    cardNo: slice.cardNo,
    clusterNo: nextClusterNo(state),
    towerNo,
    sliceKey,
    targetField: tower.targetField,
    expression: tower.expression,
    lower: tower.lower,
    upper: tower.upper,
    samplingRate: tower.samplingRate,
    blockLevel: tower.blockLevel,
    thresholdVersion: tower.thresholdVersion,
    verdict,
    status: '已封牌',
    sampledCount: sampledRows(tower, slice).length,
    hitCount: hits.length,
    withheldCount: verdict === '放行' ? 0 : hits.length,
    rootBatchNo: batchNo,
    sealedAt: nowLabel(),
  }
  const needles = verdict === '放行'
    ? []
    : buildNeedles(tower, slice, batchNo, '正卷', card.cardNo, card.clusterNo, hits)

  const next: TowerState = {
    ...state,
    cards: [...state.cards, card],
    needles: [...state.needles, ...needles],
    towers: state.towers.map((item) =>
      item.towerNo !== towerNo
        ? item
        : {
            ...item,
            slices: item.slices.map((entry) =>
              entry.sliceKey === sliceKey
                ? { ...entry, sealed: true, lastVersion: tower.thresholdVersion }
                : entry,
            ),
          },
    ),
  }
  saveTowerState(next)
  return {
    ok: true,
    replay: false,
    message: `${tower.tableName} ${slice.label} 封牌 ${card.cardNo}（簇 ${card.clusterNo}）：结论「${verdict}」，扣留 ${card.withheldCount} 行`,
    card,
  }
}

/** 换阈值：只改塔当前参数和版本号，已封牌切片原样保留，不翻案。 */
export function updateThreshold(towerNo: string, patch: ThresholdPatch): SealResult {
  const state = towerState()
  const tower = state.towers.find((item) => item.towerNo === towerNo)
  if (!tower) return { ok: false, replay: false, message: `没有找到判词塔 ${towerNo}` }

  const lower = patch.lower ?? tower.lower
  const upper = patch.upper ?? tower.upper
  const samplingRate = patch.samplingRate ?? tower.samplingRate
  if (lower > upper) return { ok: false, replay: false, message: '阈值下界不能高于阈值上界' }
  if (!(samplingRate > 0 && samplingRate <= 1)) {
    return { ok: false, replay: false, message: '采样比例必须在 (0, 1] 之间' }
  }

  const updated: JudgmentTower = {
    ...tower,
    lower,
    upper,
    samplingRate,
    blockLevel: patch.blockLevel ?? tower.blockLevel,
    thresholdVersion: tower.thresholdVersion + 1,
  }
  saveTowerState({
    ...state,
    towers: state.towers.map((item) => (item.towerNo === towerNo ? updated : item)),
  })
  const sealed = updated.slices.filter((slice) => slice.sealed).length
  const open = updated.slices.length - sealed
  return {
    ok: true,
    replay: false,
    message: `阈值升到 v${updated.thresholdVersion}：${sealed} 个已封牌切片保留原牌，${open} 个未封牌切片待重算`,
  }
}

/** 回看：以质量校验的塔顶牌结论为主对象，证据与处置只作附件。 */
export function reviewCard(cardNo: string): {
  card: VerdictCard | undefined
  primary: { ruleNo: string; towerNo: string; verdict: Verdict; blockLevel: BlockLevel; sealed: boolean } | undefined
  needles: EvidenceNeedle[]
  dispositions: DispositionRecord[]
} {
  const state = towerState()
  const card = state.cards.find((item) => item.cardNo === cardNo)
  if (!card) return { card: undefined, primary: undefined, needles: [], dispositions: [] }
  const tower = state.towers.find((item) => item.towerNo === card.towerNo)
  const slice = tower?.slices.find((item) => item.sliceKey === card.sliceKey)
  return {
    card: { ...card },
    primary: {
      ruleNo: tower?.ruleNo ?? '—',
      towerNo: card.towerNo,
      verdict: card.verdict,
      blockLevel: card.blockLevel,
      sealed: slice?.sealed ?? true,
    },
    needles: state.needles.filter((needle) => needle.cardNo === cardNo),
    dispositions: state.dispositions.filter(
      (item) => item.cardNo === cardNo || item.clusterNo === card.clusterNo,
    ),
  }
}

/**
 * 核对四类处置：残留、不生效、显示成上一档、错位。
 * 逐张已封牌的牌核对（历史牌不翻案，但牌面上的问题仍要登记），
 * 每条处置都落处置号；同一张牌同一类问题只登记一次，重复核对不重复发号。
 */
export function reconcileDispositions(): ReconcileResult {
  const state = towerState()
  const found: Omit<DispositionRecord, 'dispositionNo'>[] = []
  const createdAt = nowLabel()

  for (const root of state.cards) {
    if (root.status !== '已封牌') continue
    const tower = state.towers.find((item) => item.towerNo === root.towerNo)
    const slice = tower?.slices.find((item) => item.sliceKey === root.sliceKey)
    if (!tower || !slice) continue

    // 残留：扣留行有 3 条，正卷证据只带回 2 条，缺的那条还挂在原切片上。
    const positiveNeedles = state.needles.filter(
      (needle) => needle.cardNo === root.cardNo && needle.volume === '正卷',
    )
    if (root.withheldCount > positiveNeedles.length) {
      const missing = root.withheldCount - positiveNeedles.length
      found.push({
        category: 'ticket_residue',
        categoryLabel: DISPOSITION_META.ticket_residue.label,
        cardNo: root.cardNo,
        clusterNo: root.clusterNo,
        summary: `扣留 ${root.withheldCount} 行，正卷只有 ${positiveNeedles.length} 条证据`,
        detail: `处置号没跟牌走：${slice.label} 缺 ${missing} 条被扣留行证据，需要按牌号 ${root.cardNo} 补挂后再交付清洗。`,
        createdAt,
      })
    }

    // 不生效：有命中却封成放行，规则虽然启用，运行时等于被跳过。
    if (root.verdict === '放行' && root.hitCount > 0) {
      found.push({
        category: 'silent_rule',
        categoryLabel: DISPOSITION_META.silent_rule.label,
        cardNo: root.cardNo,
        clusterNo: root.clusterNo,
        summary: `命中 ${root.hitCount} 行，牌面却是放行`,
        detail: `规则 ${tower.ruleNo} 状态是已启用，${slice.label} 没有扣留结论，运行时整条规则被跳过；阻断级别当前为 ${tower.blockLevel}。`,
        createdAt,
      })
    }

    // 显示成上一档：只对塔顶牌核，塔当前级别高于牌面记录的级别即牌面落后一档；
    // 更早的牌是封牌当时的留档，不算漂移。
    const top = topSlice(tower)
    if (top?.sliceKey === root.sliceKey && levelRank(tower.blockLevel) > levelRank(root.blockLevel)) {
      found.push({
        category: 'level_drift',
        categoryLabel: DISPOSITION_META.level_drift.label,
        cardNo: root.cardNo,
        clusterNo: root.clusterNo,
        summary: `塔当前 ${tower.blockLevel}，牌面仍是 ${root.blockLevel}`,
        detail: `封牌时记下的阻断级别没跟上塔层改动，牌面显示成上一档；历史牌不翻案，新切片按 ${tower.blockLevel} 执行。`,
        createdAt,
      })
    }

    // 错位：挂在这张牌上的证据针簇号与牌面簇号不一致。
    const shifted = state.needles.filter(
      (needle) => needle.cardNo === root.cardNo && needle.clusterNo !== root.clusterNo,
    )
    if (shifted.length) {
      found.push({
        category: 'cluster_shift',
        categoryLabel: DISPOSITION_META.cluster_shift.label,
        cardNo: root.cardNo,
        clusterNo: root.clusterNo,
        summary: `${shifted.length} 条证据针挂在别的簇（${[...new Set(shifted.map((item) => item.clusterNo))].join('、')}）`,
        detail: `证据针簇号与牌根 ${root.clusterNo} 错位，回看时会被归到相邻冲突簇；以质量校验牌面编号为准修正。`,
        createdAt,
      })
    }
  }

  const existingKey = new Set(
    state.dispositions.map((item) => `${item.cardNo}|${item.category}|${item.clusterNo}`),
  )
  const fresh = found.filter((item) => !existingKey.has(`${item.cardNo}|${item.category}|${item.clusterNo}`))
  let seq = state.dispositionSeq
  const created: DispositionRecord[] = fresh.map((item) => {
    seq += 1
    return { ...item, dispositionNo: `CZ-${String(seq).padStart(DISPOSITION_SEQ_WIDTH, '0')}` }
  })
  if (created.length) {
    saveTowerState({
      ...state,
      dispositionSeq: seq,
      dispositions: [...state.dispositions, ...created],
    })
  }
  const counts: Record<DispositionCategory, number> = {
    ticket_residue: 0,
    silent_rule: 0,
    level_drift: 0,
    cluster_shift: 0,
  }
  for (const item of created) counts[item.category] += 1
  return {
    created,
    skipped: found.length - fresh.length,
    counts,
    message: created.length
      ? `核对完成，新登记 ${created.length} 条处置`
      : '核对完成，没有新增处置（同类问题已有处置号）',
  }
}

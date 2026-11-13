/** 质量校验「判词塔」的公共类型：塔层、裁决牌、证据针与处置记录。 */

export type BlockLevel = 'P0-阻断' | 'P1-扣留' | 'P2-观察'

/** 裁决结论：只有阻断 / 扣留会留下被扣留行。 */
export type Verdict = '阻断' | '扣留' | '放行'

export type CardStatus = '待封牌' | '已封牌'

/** 正卷是塔顶牌根批次的证据，副卷是并行争抢落败批次的证据。 */
export type EvidenceVolume = '正卷' | '副卷'

export type SampleRow = {
  rowNo: number
  value: number
}

export type TowerSlice = {
  sliceKey: string
  label: string
  sealed: boolean
  /** 当前切片在塔顶展示的裁决牌号；未封牌时是待封的草牌号。 */
  cardNo: string
  /** 该切片最近一次计算所用阈值版本；封牌后不再变化。 */
  lastVersion: number
  rows: SampleRow[]
}

export type JudgmentTower = {
  towerNo: string
  tableName: string
  targetField: string
  ruleNo: string
  expression: string
  lower: number
  upper: number
  samplingRate: number
  blockLevel: BlockLevel
  /** 当前生效阈值版本；换阈值只影响尚未封牌的切片。 */
  thresholdVersion: number
  slices: TowerSlice[]
}

export type VerdictCard = {
  /** 封牌号：同一封牌号重放必须返回原牌。 */
  cardNo: string
  /** 冲突簇编号：同一簇内的证据/裁决可以归并回看。 */
  clusterNo: string
  towerNo: string
  sliceKey: string
  targetField: string
  expression: string
  lower: number
  upper: number
  samplingRate: number
  blockLevel: BlockLevel
  thresholdVersion: number
  verdict: Verdict
  status: CardStatus
  sampledCount: number
  hitCount: number
  withheldCount: number
  /** 留下牌根的批次号。 */
  rootBatchNo: string
  /** 并行争抢落败的批次号，其证据进入副卷；没有争抢时为空。 */
  secondaryBatchNo?: string
  sealedAt: string
}

export type EvidenceNeedle = {
  needleNo: string
  cardNo: string
  clusterNo: string
  towerNo: string
  sliceKey: string
  targetField: string
  rowNo: number
  observedValue: number
  reason: string
  batchNo: string
  volume: EvidenceVolume
}

export type DispositionCategory =
  | 'ticket_residue'
  | 'silent_rule'
  | 'level_drift'
  | 'cluster_shift'

export type DispositionRecord = {
  /** 处置号：每一条处置记录都必须留下可追溯的编号。 */
  dispositionNo: string
  category: DispositionCategory
  categoryLabel: string
  cardNo: string
  clusterNo: string
  summary: string
  detail: string
  createdAt: string
}

export type TowerState = {
  towers: JudgmentTower[]
  cards: VerdictCard[]
  needles: EvidenceNeedle[]
  dispositions: DispositionRecord[]
  dispositionSeq: number
}

export type DispositionMeta = {
  label: string
  meaning: string
  template: string
}

/** ADS 的只读投影：只给塔顶牌，不带证据针。 */
export type TopCardReadModel = {
  towerNo: string
  tableName: string
  targetField: string
  cardNo: string
  clusterNo: string
  verdict: Verdict
  blockLevel: BlockLevel
  thresholdVersion: number
  withheldCount: number
  rootBatchNo: string
  sealedAt: string
}

export type ReconcileResult = {
  created: DispositionRecord[]
  skipped: number
  counts: Record<DispositionCategory, number>
  message: string
}

export type ThresholdPatch = {
  lower?: number
  upper?: number
  samplingRate?: number
  blockLevel?: BlockLevel
}

export type SealOptions = {
  batchNo?: string
  rivalBatchNo?: string
}

export type SealResult = {
  ok: boolean
  replay: boolean
  message: string
  card?: VerdictCard
}

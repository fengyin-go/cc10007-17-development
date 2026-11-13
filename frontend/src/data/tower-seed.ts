import type {
  BlockLevel,
  DispositionMeta,
  EvidenceNeedle,
  JudgmentTower,
  SampleRow,
  TowerState,
  VerdictCard,
} from '@/data/tower-types'

// 判词塔示例：三张质量规则塔，每塔五个时间切片（前四个已封牌、最后一个开口）。
// 已封牌切片保留封牌当时的阈值版本（v3），塔当前生效的是 v4：
// 换阈值后已封的牌不动，只有开口的 T-5 按新阈值重算。
// 示例里刻意留了四处历史瑕疵，供「核对处置」落处置号：
//   JT-0001-T-4 有 2 行命中却封成放行（不生效）
//   JT-0002-T-4 牌面 P1 落后塔当前 P0（显示成上一档）
//   JT-0002-T-4 一条证据针簇号写成 CF-007（错位）
//   JT-0003-T-4 扣留 3 行只带回 2 条证据（残留）

export const DISPOSITION_META: Record<string, DispositionMeta> = {
  ticket_residue: {
    label: '残留',
    meaning: '处置号没跟牌走，旧批次留下的扣留行还挂在原切片上',
    template: '残留',
  },
  silent_rule: {
    label: '不生效',
    meaning: '规则状态是已启用，但塔顶没有扣留结论，运行时整条规则被跳过',
    template: '不生效',
  },
  level_drift: {
    label: '显示成上一档',
    meaning: '阻断级别与实际执行的扣留力度对不上，牌面显示成上一档',
    template: '显示成上一档',
  },
  cluster_shift: {
    label: '错位',
    meaning: '证据针挂到了别的冲突簇，回看时簇号与牌面不一致',
    template: '错位',
  },
}

type CardSeed = {
  verdict: '阻断' | '扣留' | '放行'
  blockLevel: BlockLevel
  withheldCount: number
  needleRows: number[]
  needleClusterOverride?: Record<number, string>
}

type SeedSlice = {
  label: string
  version: number
  sealed: boolean
  clusterNo?: string
  lower: number
  upper: number
  rows: number[]
  card?: CardSeed
}

type TowerSeed = {
  towerNo: string
  tableName: string
  targetField: string
  ruleNo: string
  expression: string
  lower: number
  upper: number
  samplingRate: number
  blockLevel: BlockLevel
  slices: SeedSlice[]
}

const TOWER_SEEDS: TowerSeed[] = [
  {
    towerNo: 'JT-0001',
    tableName: 'dwd_order_detail',
    targetField: 'pay_amount',
    ruleNo: 'QUAL-0001',
    expression: 'pay_amount BETWEEN 0.88 AND 0.99',
    lower: 0.88,
    upper: 0.99,
    samplingRate: 0.5,
    blockLevel: 'P0-阻断',
    slices: [
      {
        label: 'T-1',
        version: 3,
        sealed: true,
        clusterNo: 'CF-001',
        lower: 0.9,
        upper: 0.99,
        rows: [0.95, 0.93, 0.85, 0.96, 0.94, 0.92, 0.97, 0.9, 0.93, 0.95],
        card: { verdict: '阻断', blockLevel: 'P0-阻断', withheldCount: 1, needleRows: [3] },
      },
      {
        label: 'T-2',
        version: 3,
        sealed: true,
        clusterNo: 'CF-002',
        lower: 0.9,
        upper: 0.99,
        rows: [0.91, 0.92, 0.94, 0.95, 0.93, 0.96, 0.94, 0.92, 0.95, 0.93],
        card: { verdict: '放行', blockLevel: 'P0-阻断', withheldCount: 0, needleRows: [] },
      },
      {
        label: 'T-3',
        version: 3,
        sealed: true,
        clusterNo: 'CF-003',
        lower: 0.9,
        upper: 0.99,
        rows: [0.95, 0.88, 0.93, 1.02, 0.94, 0.91, 0.96, 0.93, 0.95, 0.92],
        card: { verdict: '阻断', blockLevel: 'P0-阻断', withheldCount: 2, needleRows: [2, 4] },
      },
      {
        label: 'T-4',
        version: 3,
        sealed: true,
        clusterNo: 'CF-004',
        lower: 0.9,
        upper: 0.99,
        rows: [0.94, 0.97, 0.89, 0.96, 1.01, 0.92, 0.95, 0.93, 0.96, 0.94],
        // 有 2 行命中却封成放行：运行时规则没有真正生效。
        card: { verdict: '放行', blockLevel: 'P0-阻断', withheldCount: 0, needleRows: [] },
      },
      {
        label: 'T-5',
        version: 0,
        sealed: false,
        lower: 0.88,
        upper: 0.99,
        rows: [0.95, 0.71, 0.92, 0.98, 0.9, 0.94, 0.97, 0.91, 0.93, 0.96],
      },
    ],
  },
  {
    towerNo: 'JT-0002',
    tableName: 'dws_user_profile',
    targetField: 'credit_score',
    ruleNo: 'QUAL-0002',
    expression: 'credit_score BETWEEN 0.62 AND 0.76',
    lower: 0.62,
    upper: 0.76,
    samplingRate: 0.4,
    blockLevel: 'P0-阻断',
    slices: [
      {
        label: 'T-1',
        version: 3,
        sealed: true,
        clusterNo: 'CF-005',
        lower: 0.64,
        upper: 0.76,
        rows: [0.62, 0.71, 0.8, 0.66, 0.64, 0.69, 0.72, 0.7, 0.65, 0.68],
        card: { verdict: '扣留', blockLevel: 'P1-扣留', withheldCount: 2, needleRows: [1, 3] },
      },
      {
        label: 'T-2',
        version: 3,
        sealed: true,
        clusterNo: 'CF-006',
        lower: 0.64,
        upper: 0.76,
        rows: [0.65, 0.7, 0.68, 0.73, 0.66, 0.69, 0.72, 0.71, 0.74, 0.67],
        card: { verdict: '放行', blockLevel: 'P1-扣留', withheldCount: 0, needleRows: [] },
      },
      {
        label: 'T-3',
        version: 3,
        sealed: true,
        clusterNo: 'CF-007',
        lower: 0.64,
        upper: 0.76,
        rows: [0.58, 0.65, 0.77, 0.72, 0.65, 0.69, 0.71, 0.67, 0.74, 0.7],
        card: { verdict: '扣留', blockLevel: 'P1-扣留', withheldCount: 2, needleRows: [1, 3] },
      },
      {
        label: 'T-4',
        version: 3,
        sealed: true,
        clusterNo: 'CF-008',
        lower: 0.64,
        upper: 0.76,
        rows: [0.55, 0.65, 0.79, 0.7, 0.66, 0.68, 0.72, 0.69, 0.73, 0.64],
        // 塔已升到 P0，这张牌还写着 P1；且第二条证据针挂到上一簇 CF-007。
        card: {
          verdict: '扣留',
          blockLevel: 'P1-扣留',
          withheldCount: 2,
          needleRows: [1, 3],
          needleClusterOverride: { 3: 'CF-007' },
        },
      },
      {
        label: 'T-5',
        version: 0,
        sealed: false,
        lower: 0.62,
        upper: 0.76,
        rows: [0.63, 0.59, 0.66, 0.72, 0.68, 0.7, 0.64, 0.71, 0.69, 0.67],
      },
    ],
  },
  {
    towerNo: 'JT-0003',
    tableName: 'ads_channel_report',
    targetField: 'channel_rate',
    ruleNo: 'QUAL-0003',
    expression: 'channel_rate BETWEEN 0.70 AND 0.80',
    lower: 0.7,
    upper: 0.8,
    samplingRate: 1,
    blockLevel: 'P1-扣留',
    slices: [
      {
        label: 'T-1',
        version: 3,
        sealed: true,
        clusterNo: 'CF-009',
        lower: 0.68,
        upper: 0.82,
        rows: [0.7, 0.72, 0.66, 0.71, 0.75, 0.74, 0.69, 0.73, 0.76, 0.7],
        card: { verdict: '扣留', blockLevel: 'P1-扣留', withheldCount: 1, needleRows: [3] },
      },
      {
        label: 'T-2',
        version: 3,
        sealed: true,
        clusterNo: 'CF-010',
        lower: 0.68,
        upper: 0.82,
        rows: [0.7, 0.72, 0.69, 0.71, 0.75, 0.74, 0.7, 0.73, 0.76, 0.7],
        card: { verdict: '放行', blockLevel: 'P1-扣留', withheldCount: 0, needleRows: [] },
      },
      {
        label: 'T-3',
        version: 3,
        sealed: true,
        clusterNo: 'CF-011',
        lower: 0.68,
        upper: 0.82,
        rows: [0.7, 0.83, 0.71, 0.75, 0.65, 0.74, 0.69, 0.73, 0.76, 0.7],
        card: { verdict: '扣留', blockLevel: 'P1-扣留', withheldCount: 2, needleRows: [2, 5] },
      },
      {
        label: 'T-4',
        version: 3,
        sealed: true,
        clusterNo: 'CF-012',
        lower: 0.68,
        upper: 0.82,
        rows: [0.83, 0.72, 0.71, 0.75, 0.65, 0.74, 0.69, 0.6, 0.76, 0.7],
        // 扣留 3 行，却只带回 2 条证据，剩下一条成了残留。
        card: { verdict: '扣留', blockLevel: 'P1-扣留', withheldCount: 3, needleRows: [1, 5] },
      },
      {
        label: 'T-5',
        version: 0,
        sealed: false,
        lower: 0.7,
        upper: 0.8,
        rows: [0.72, 0.71, 0.66, 0.75, 0.74, 0.69, 0.73, 0.76, 0.7, 0.67],
      },
    ],
  },
]

function makeRows(values: number[]): SampleRow[] {
  return values.map((value, index) => ({ rowNo: index + 1, value }))
}

function sampledCount(samplingRate: number, total: number): number {
  return Math.max(1, Math.floor(total * samplingRate))
}

function buildCard(tower: TowerSeed, slice: SeedSlice, sliceKey: string, cardNo: string): VerdictCard {
  const card = slice.card
  if (!card) throw new Error(`切片 ${sliceKey} 缺少封牌数据`)
  const sampled = sampledCount(tower.samplingRate, slice.rows.length)
  const hitCount = slice.rows
    .slice(0, sampled)
    .filter((value) => value < slice.lower || value > slice.upper).length
  return {
    cardNo,
    clusterNo: slice.clusterNo ?? '',
    towerNo: tower.towerNo,
    sliceKey,
    targetField: tower.targetField,
    expression: `${tower.targetField} BETWEEN ${slice.lower} AND ${slice.upper}`,
    // 历史牌按封牌当时那一版阈值留档，不随塔当前 v4 变化。
    lower: slice.lower,
    upper: slice.upper,
    samplingRate: tower.samplingRate,
    blockLevel: card.blockLevel,
    thresholdVersion: slice.version,
    verdict: card.verdict,
    status: '已封牌',
    sampledCount: sampled,
    hitCount,
    withheldCount: card.withheldCount,
    rootBatchNo: `BT-${tower.towerNo.slice(3)}-${slice.label}-A`,
    sealedAt: `2026-11-0${Number(slice.label.slice(2))} 08:30:00`,
  }
}

function buildNeedles(tower: TowerSeed, slice: SeedSlice, sliceKey: string, card: VerdictCard): EvidenceNeedle[] {
  const seed = slice.card
  if (!seed) return []
  return seed.needleRows.map((rowNo, index) => ({
    needleNo: `EZ-${sliceKey}-正卷-${String(index + 1).padStart(2, '0')}`,
    cardNo: card.cardNo,
    clusterNo: seed.needleClusterOverride?.[rowNo] ?? card.clusterNo,
    towerNo: tower.towerNo,
    sliceKey,
    targetField: tower.targetField,
    rowNo,
    observedValue: slice.rows[rowNo - 1],
    reason: `${tower.targetField} BETWEEN ${slice.lower} AND ${slice.upper}：值 ${slice.rows[rowNo - 1]} 不在 [${slice.lower}, ${slice.upper}]`,
    batchNo: card.rootBatchNo,
    volume: '正卷',
  }))
}

export function seedTowerState(): TowerState {
  const towers: JudgmentTower[] = []
  const cards: VerdictCard[] = []
  const needles: EvidenceNeedle[] = []

  for (const seed of TOWER_SEEDS) {
    const slices = seed.slices.map((slice) => {
      const sliceKey = `${seed.towerNo}-${slice.label}`
      const cardNo = `JC-${seed.towerNo.slice(3)}-${slice.label.slice(2).padStart(2, '0')}`
      if (slice.sealed) {
        const card = buildCard(seed, slice, sliceKey, cardNo)
        cards.push(card)
        needles.push(...buildNeedles(seed, slice, sliceKey, card))
      }
      return {
        sliceKey,
        label: slice.label,
        sealed: slice.sealed,
        cardNo,
        lastVersion: slice.version,
        rows: makeRows(slice.rows),
      }
    })
    towers.push({
      towerNo: seed.towerNo,
      tableName: seed.tableName,
      targetField: seed.targetField,
      ruleNo: seed.ruleNo,
      expression: seed.expression,
      lower: seed.lower,
      upper: seed.upper,
      samplingRate: seed.samplingRate,
      blockLevel: seed.blockLevel,
      thresholdVersion: 4,
      slices,
    })
  }

  return { towers, cards, needles, dispositions: [], dispositionSeq: 0 }
}

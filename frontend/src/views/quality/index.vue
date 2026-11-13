<template>
  <section class="page" data-module="quality">
    <header class="page-head">
      <div>
        <h2>质量校验 · 判词塔</h2>
        <p class="page-desc">
          目标字段按时间切片逐层叠加表达式、阈值、采样率与阻断级别，塔顶落一张带冲突簇编号的裁决牌。已封牌的切片不再重算，换阈值只影响尚未封牌的切片。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记质量规则</button>
        <button class="btn" type="button" @click="exportRows">导出质量校验清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="tower-selector">
      <button
        v-for="tower in towers"
        :key="tower.towerNo"
        class="tower-chip"
        :class="{ active: tower.towerNo === activeTowerNo }"
        type="button"
        @click="selectTower(tower.towerNo)"
      >
        <strong>{{ tower.towerNo }}</strong>
        <span>{{ tower.tableName }}.{{ tower.targetField }}</span>
        <span class="chip-meta">{{ tower.blockLevel }} · v{{ tower.thresholdVersion }}</span>
      </button>
    </div>

    <template v-if="activeTower">
      <div class="tower-layout">
        <article class="panel tower-layers">
          <header class="panel-head">
            <div>
              <h3>{{ activeTower.towerNo }} · {{ activeTower.tableName }}</h3>
              <p class="muted">
                目标字段 {{ activeTower.targetField }} · 规则 {{ activeTower.ruleNo }}
              </p>
            </div>
            <span class="badge level">{{ activeTower.blockLevel }}</span>
          </header>
          <p class="tower-formula">
            <span>{{ activeTower.expression }}</span>
            <span class="formula-item">阈值 [{{ activeTower.lower }}, {{ activeTower.upper }}]</span>
            <span class="formula-item">采样 {{ Math.round(activeTower.samplingRate * 100) }}%</span>
            <span class="formula-item">版本 v{{ activeTower.thresholdVersion }}</span>
          </p>

          <ol class="layer-stack">
            <li
              v-for="(slice, index) in activeTower.slices"
              :key="slice.sliceKey"
              class="slice-row"
              :class="{ sealed: slice.sealed, open: !slice.sealed }"
            >
              <div class="slice-index">{{ index + 1 }}</div>
              <div class="slice-body">
                <div class="slice-head">
                  <strong>时间切片 {{ slice.label }}</strong>
                  <span class="badge" :class="slice.sealed ? 'sealed' : 'open'">
                    {{ slice.sealed ? '已封牌' : '待封牌' }}
                  </span>
                  <span v-if="slice.sealed" class="badge card">{{ slice.cardNo }}</span>
                  <span v-if="slice.sealed" class="badge cluster">
                    簇 {{ cardOf(slice)?.clusterNo ?? '—' }}
                  </span>
                  <span v-else class="badge draft">草牌 {{ slice.cardNo }}</span>
                </div>
                <div class="slice-meta">
                  <span>{{ expressionOf(slice) }}</span>
                  <span>采样 {{ Math.round(samplingOf(slice) * 100) }}%</span>
                  <span>级别 {{ levelOf(slice) }}</span>
                  <span>{{ slice.sealed ? `封牌版本 v${slice.lastVersion}` : `按当前 v${activeTower.thresholdVersion} 待重算` }}</span>
                </div>
                <div v-if="slice.sealed && cardOf(slice)" class="slice-verdict">
                  <span class="badge" :class="verdictClass(cardOf(slice)!.verdict)">
                    {{ cardOf(slice)!.verdict }}
                  </span>
                  <span>采样 {{ cardOf(slice)!.sampledCount }} 行</span>
                  <span>命中 {{ cardOf(slice)!.hitCount }} 行</span>
                  <span>扣留 {{ cardOf(slice)!.withheldCount }} 行</span>
                  <span>牌根批次 {{ cardOf(slice)!.rootBatchNo }}</span>
                  <span v-if="cardOf(slice)!.secondaryBatchNo" class="muted">
                    副卷批次 {{ cardOf(slice)!.secondaryBatchNo }}
                  </span>
                </div>
                <div v-else class="slice-verdict">
                  <span class="muted">尚未封牌，封牌前预览结论：</span>
                  <span class="badge" :class="verdictClass(previewOf(slice))">{{ previewOf(slice) }}</span>
                  <span class="muted">重算只在这一片发生，已封牌切片不受影响</span>
                </div>
                <div class="row-actions">
                  <template v-if="slice.sealed && cardOf(slice)">
                    <button class="link" type="button" @click="replay(slice)">重放同号封牌</button>
                    <button class="link" type="button" @click="race(slice)">模拟并行争抢</button>
                  </template>
                  <button v-else class="btn small" type="button" @click="seal(slice)">
                    按当前参数封牌
                  </button>
                </div>
              </div>
            </li>
          </ol>
          <p v-if="sealMessage" class="seal-message">{{ sealMessage }}</p>
        </article>

        <aside class="tower-side">
          <article class="panel">
            <header class="panel-head">
              <h3>塔顶裁决牌</h3>
              <span class="muted">ADS 只能读到这里</span>
            </header>
            <div v-if="topCard" class="card-plate">
              <div class="card-plate-head">
                <span class="badge cluster">冲突簇 {{ topCard.clusterNo }}</span>
                <span class="badge" :class="verdictClass(topCard.verdict)">{{ topCard.verdict }}</span>
              </div>
              <strong class="card-plate-no">{{ topCard.cardNo }}</strong>
              <p class="muted">{{ topCard.tableName }}.{{ topCard.targetField }}</p>
              <dl class="card-facts">
                <div><dt>阻断级别</dt><dd>{{ topCard.blockLevel }}</dd></div>
                <div><dt>封牌版本</dt><dd>v{{ topCard.thresholdVersion }}</dd></div>
                <div><dt>扣留行数</dt><dd>{{ topCard.withheldCount }}</dd></div>
                <div><dt>牌根批次</dt><dd>{{ topCard.rootBatchNo }}</dd></div>
                <div><dt>封牌时间</dt><dd>{{ topCard.sealedAt }}</dd></div>
              </dl>
              <p class="muted card-note">牌面只带裁决结论；被扣留行的证据针由清洗加工读取。</p>
            </div>
            <p v-else class="muted">这座塔还没有封过牌，塔顶没有裁决牌。</p>
          </article>

          <article class="panel">
            <header class="panel-head">
              <h3>换阈值</h3>
              <span class="muted">只重算未封牌切片</span>
            </header>
            <form class="threshold-form" @submit.prevent="applyThreshold">
              <label class="field">
                <span>阈值下界</span>
                <input v-model.number="thresholdForm.lower" type="number" step="0.01" />
              </label>
              <label class="field">
                <span>阈值上界</span>
                <input v-model.number="thresholdForm.upper" type="number" step="0.01" />
              </label>
              <label class="field">
                <span>采样比例（0-1）</span>
                <input v-model.number="thresholdForm.samplingRate" type="number" step="0.05" min="0.05" max="1" />
              </label>
              <label class="field">
                <span>阻断级别</span>
                <select v-model="thresholdForm.blockLevel">
                  <option v-for="level in blockLevels" :key="level" :value="level">{{ level }}</option>
                </select>
              </label>
              <button class="btn primary" type="submit">应用新阈值</button>
            </form>
            <p v-if="thresholdMessage" class="threshold-message">{{ thresholdMessage }}</p>
          </article>

          <article class="panel">
            <header class="panel-head">
              <h3>回看裁决</h3>
              <span class="muted">以质量校验结论为主对象</span>
            </header>
            <label class="field">
              <span>选择封牌号</span>
              <select v-model="reviewCardNo">
                <option value="">请选择</option>
                <option v-for="card in towerCards" :key="card.cardNo" :value="card.cardNo">
                  {{ card.cardNo }} · {{ card.sliceKey }} · {{ card.verdict }}
                </option>
              </select>
            </label>
            <div v-if="review.card" class="review-box">
              <p>
                <span class="badge cluster">簇 {{ review.card.clusterNo }}</span>
                <span class="badge" :class="verdictClass(review.card.verdict)">{{ review.card.verdict }}</span>
                <span class="badge level">{{ review.card.blockLevel }}</span>
              </p>
              <p class="muted">
                质量规则 {{ review.primary?.ruleNo }} 的阻断结论为准：{{ review.primary?.verdict }}，封牌版本 v{{ review.card.thresholdVersion }}。下方证据针与处置号只作附件。
              </p>
              <p class="muted">
                正卷证据 {{ review.needles.filter((item) => item.volume === '正卷').length }} 条 ·
                副卷证据 {{ review.needles.filter((item) => item.volume === '副卷').length }} 条 ·
                相关处置 {{ review.dispositions.length }} 条
              </p>
              <button class="link" type="button" @click="reviewCardNo = ''">收起</button>
            </div>
            <p v-else class="muted">选一张牌，核对质量规则当时的阻断结论。</p>
          </article>
        </aside>
      </div>

      <section class="panel disposition-panel">
        <header class="panel-head">
          <div>
            <h3>处置记录</h3>
            <p class="muted">按 ticket_residue / silent_rule / level_drift / cluster_shift 分类，每条都留处置号。</p>
          </div>
          <button class="btn primary" type="button" @click="reconcile">核对并登记处置</button>
        </header>
        <div class="category-row">
          <article v-for="item in categoryCards" :key="item.key" class="category-card">
            <span class="category-label">{{ item.label }}（{{ item.key }}）</span>
            <strong class="category-count">{{ item.count }}</strong>
            <p class="muted">{{ item.meaning }}</p>
          </article>
        </div>
        <p v-if="reconcileMessage" class="seal-message">{{ reconcileMessage }}</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>处置号</th><th>分类</th><th>牌号</th><th>冲突簇</th><th>说明</th><th>登记时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in dispositions" :key="item.dispositionNo">
              <td>{{ item.dispositionNo }}</td>
              <td>
                <span class="category-tag" :class="item.category">{{ item.category }}</span>
                {{ item.categoryLabel }}
              </td>
              <td>{{ item.cardNo }}</td>
              <td>{{ item.clusterNo }}</td>
              <td>
                <strong>{{ item.summary }}</strong>
                <p class="muted">{{ item.detail }}</p>
              </td>
              <td>{{ item.createdAt }}</td>
            </tr>
            <tr v-if="!dispositions.length">
              <td colspan="6" class="empty-state">还没有处置记录，先核对一次质量校验的阻断结论</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <table class="data-table rule-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无质量校验数据，可先登记质量规则</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条质量校验记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  evaluateSlice,
  findTower,
  listCards,
  listDispositions,
  listTopCards,
  listTowers,
  reconcileDispositions,
  reviewCard,
  sealSlice,
  updateThreshold,
} from '@/api/tower-service'
import { DISPOSITION_META } from '@/data/tower-seed'
import type {
  BlockLevel,
  JudgmentTower,
  TopCardReadModel,
  TowerSlice,
  Verdict,
  VerdictCard,
} from '@/data/tower-types'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('quality')
const columns = ["规则编号", "校验表名", "目标字段", "校验表达式", "阈值下界", "阈值上界", "采样比例", "阻断级别"]
const actions = ["提交校验", "启用规则", "停用规则"]
const statuses = ["草稿", "待校验", "已启用", "已停用"]
const blockLevels: BlockLevel[] = ['P0-阻断', 'P1-扣留', 'P2-观察']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 判词塔的页面状态：用 tick 显式触发重读，服务层是最新副本。
const tick = ref(0)
const activeTowerNo = ref('')
const reviewCardNo = ref('')
const sealMessage = ref('')
const thresholdMessage = ref('')
const reconcileMessage = ref('')
const thresholdForm = reactive({
  lower: 0,
  upper: 1,
  samplingRate: 0.5,
  blockLevel: 'P0-阻断' as BlockLevel,
})

const towers = computed<JudgmentTower[]>(() => {
  void tick.value
  return listTowers()
})

const activeTower = computed<JudgmentTower | undefined>(() => {
  void tick.value
  return findTower(activeTowerNo.value)
})

const towerCards = computed<VerdictCard[]>(() => {
  void tick.value
  return listCards(activeTowerNo.value)
})

const topCard = computed<TopCardReadModel | undefined>(() => {
  void tick.value
  return listTopCards().find((card) => card.towerNo === activeTowerNo.value)
})

const review = computed(() => {
  void tick.value
  return reviewCard(reviewCardNo.value)
})

const dispositions = computed(() => {
  void tick.value
  return listDispositions()
})

const stats = computed(() => {
  void tick.value
  const sealed = towers.value.reduce(
    (sum, tower) => sum + tower.slices.filter((slice) => slice.sealed).length,
    0,
  )
  const open = towers.value.reduce(
    (sum, tower) => sum + tower.slices.filter((slice) => !slice.sealed).length,
    0,
  )
  return [
    { label: '判词塔', value: towers.value.length },
    { label: '已封牌切片', value: sealed },
    { label: '待封牌切片', value: open },
    { label: '处置记录', value: dispositions.value.length },
  ]
})

const categoryCards = computed(() => {
  void tick.value
  return (Object.keys(DISPOSITION_META) as (keyof typeof DISPOSITION_META)[]).map((key) => ({
    key,
    label: DISPOSITION_META[key].label,
    meaning: DISPOSITION_META[key].meaning,
    count: dispositions.value.filter((item) => item.category === key).length,
  }))
})

watch(activeTowerNo, () => {
  reviewCardNo.value = ''
  thresholdMessage.value = ''
  sealMessage.value = ''
})

watch(
  activeTower,
  (tower) => {
    if (!tower) return
    thresholdForm.lower = tower.lower
    thresholdForm.upper = tower.upper
    thresholdForm.samplingRate = tower.samplingRate
    thresholdForm.blockLevel = tower.blockLevel
  },
  { immediate: true },
)

function cardOf(slice: TowerSlice): VerdictCard | undefined {
  void tick.value
  return towerCards.value.find((card) => card.sliceKey === slice.sliceKey)
}

function expressionOf(slice: TowerSlice): string {
  const card = cardOf(slice)
  return card ? card.expression : activeTower.value?.expression ?? '—'
}

function samplingOf(slice: TowerSlice): number {
  return cardOf(slice)?.samplingRate ?? activeTower.value?.samplingRate ?? 0
}

function levelOf(slice: TowerSlice): string {
  return cardOf(slice)?.blockLevel ?? activeTower.value?.blockLevel ?? '—'
}

function previewOf(slice: TowerSlice): Verdict {
  void tick.value
  if (!activeTower.value) return '放行'
  return evaluateSlice(activeTower.value.towerNo, slice.sliceKey) ?? '放行'
}

function verdictClass(verdict: Verdict | string): string {
  return verdict === '阻断' ? 'block' : verdict === '扣留' ? 'withhold' : 'pass'
}

function selectTower(no: string) {
  activeTowerNo.value = no
}

function seal(slice: TowerSlice) {
  if (!activeTower.value) return
  const result = sealSlice(activeTower.value.towerNo, slice.sliceKey)
  sealMessage.value = result.message
  tick.value += 1
  reload()
}

function replay(slice: TowerSlice) {
  const tower = activeTower.value
  const card = cardOf(slice)
  if (!tower || !card) return
  const result = sealSlice(tower.towerNo, slice.sliceKey, { batchNo: card.rootBatchNo })
  sealMessage.value = result.message
  tick.value += 1
}

function race(slice: TowerSlice) {
  const tower = activeTower.value
  const card = cardOf(slice)
  if (!tower || !card) return
  const rivalBatch = `${card.rootBatchNo}-R${towerCards.value.length}`
  const result = sealSlice(tower.towerNo, slice.sliceKey, { batchNo: rivalBatch })
  sealMessage.value = result.message
  tick.value += 1
}

function applyThreshold() {
  const tower = activeTower.value
  if (!tower) return
  const result = updateThreshold(tower.towerNo, {
    lower: thresholdForm.lower,
    upper: thresholdForm.upper,
    samplingRate: thresholdForm.samplingRate,
    blockLevel: thresholdForm.blockLevel,
  })
  thresholdMessage.value = result.message
  if (result.ok) {
    tick.value += 1
    sealMessage.value = ''
  }
}

function reconcile() {
  const result = reconcileDispositions()
  reconcileMessage.value = result.message
  tick.value += 1
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '质量规则登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '质量校验列表读取失败'
  }
}

onMounted(() => {
  if (!activeTowerNo.value && towers.value.length) {
    activeTowerNo.value = towers.value[0].towerNo
  }
  reload()
})
</script>

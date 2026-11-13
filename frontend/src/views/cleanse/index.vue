<template>
  <section class="page" data-module="cleanse">
    <header class="page-head">
      <div>
        <h2>清洗加工管理</h2>
        <p class="page-desc">维护清洗加工规则的输入、执行约束与结果记录，为数据清洗提供可验证的数据工程流程。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记清洗规则</button>
        <button class="btn" type="button" @click="exportRows">导出清洗加工清单</button>
      </div>
    </header>

    <section class="panel">
      <header class="panel-head">
        <div>
          <h3>被扣留行证据针（正卷）</h3>
          <p class="muted">清洗加工按牌号读取被扣留行的证据针；副卷只登记批次，不参与本次清洗。</p>
        </div>
        <label class="field inline-field">
          <span>判词塔</span>
          <select v-model="needleTowerNo">
            <option v-for="tower in towers" :key="tower.towerNo" :value="tower.towerNo">
              {{ tower.towerNo }} · {{ tower.tableName }}.{{ tower.targetField }}
            </option>
          </select>
        </label>
      </header>
      <p class="muted">
        正卷证据 {{ positiveNeedles.length }} 条 ·
        副卷证据 {{ secondaryNeedles.length }} 条 ·
        涉及裁决牌 {{ needleCardCount }} 张
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>证据针号</th><th>裁决牌号</th><th>冲突簇</th><th>时间切片</th>
            <th>目标字段</th><th>行号</th><th>实测值</th><th>扣留原因</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="needle in positiveNeedles" :key="needle.needleNo">
            <td>{{ needle.needleNo }}</td>
            <td>{{ needle.cardNo }}</td>
            <td>{{ needle.clusterNo }}</td>
            <td>{{ needle.sliceKey }}</td>
            <td>{{ needle.targetField }}</td>
            <td>{{ needle.rowNo }}</td>
            <td>{{ needle.observedValue }}</td>
            <td>{{ needle.reason }}</td>
          </tr>
          <tr v-if="!positiveNeedles.length">
            <td colspan="8" class="empty-state">这座塔没有正卷证据，清洗无需处理被扣留行</td>
          </tr>
        </tbody>
      </table>
    </section>

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

    <table class="data-table">
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
          <td :colspan="columns.length + 2" class="empty-state">暂无清洗加工数据，可先登记清洗规则</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条清洗加工记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listNeedlesForCleanse, listSecondaryNeedles, listTowers } from '@/api/tower-service'
import type { JudgmentTower } from '@/data/tower-types'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('cleanse')
const columns = ["规则编号", "输入表名", "目标表名", "空值处理", "格式校验", "异常阈值", "规则版本", "生效日期"]
const actions = ["提交校验", "启用规则", "停用规则"]
const statuses = ["草稿", "待校验", "已启用", "已停用"]
const stats = [{"label": "清洗规则总数", "value": 0}, {"label": "已启用规则", "value": 0}, {"label": "待校验规则", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const towers = ref<JudgmentTower[]>([])
const needleTowerNo = ref('')
const positiveNeedles = computed(() =>
  needleTowerNo.value ? listNeedlesForCleanse(needleTowerNo.value) : [],
)
const secondaryNeedles = computed(() =>
  needleTowerNo.value ? listSecondaryNeedles(needleTowerNo.value) : [],
)
const needleCardCount = computed(
  () => new Set(positiveNeedles.value.map((needle) => needle.cardNo)).size,
)
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '清洗规则登记入口尚未接入审批流'
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
    errorMessage.value = error instanceof Error ? error.message : '清洗加工列表读取失败'
  }
}

onMounted(() => {
  towers.value = listTowers()
  if (!needleTowerNo.value && towers.value.length) {
    needleTowerNo.value = towers.value[0].towerNo
  }
  reload()
})
</script>

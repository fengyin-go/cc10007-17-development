# 数据分层建模工作台

离线版数仓分层建模工具，覆盖贴源层、明细层、汇总层、应用层的表结构设计、分区策略配置、质量规则编排与血缘关系管理，数据持久化到浏览器本地存储。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 贴源层建模 | `ods` | 贴源表 | 表编号、源表名称、目标表名 |
| 明细层建模 | `dwd` | 明细表 | 表编号、业务域、明细表名 |
| 汇总层建模 | `dws` | 汇总表 | 表编号、汇总主题、聚合维度 |
| 应用层发布 | `ads` | 应用数据集 | 数据集编号、业务应用、输出表名 |
| 数据源管理 | `source` | 数据源连接 | 连接编号、连接类型、接入地址 |
| 分区策略 | `partition` | 分区方案 | 方案编号、目标表名、分区字段 |
| 清洗加工 | `cleanse` | 清洗规则 | 规则编号、输入表名、目标表名 |
| 转换编排 | `transform` | 转换节点 | 节点编号、输入表名、输出表名 |
| 质量校验 | `quality` | 质量规则 | 规则编号、校验表名、目标字段 |
| 血缘追踪 | `lineage` | 血缘关系 | 关系编号、上游表名、下游表名 |
| 历史补数 | `backfill` | 补数任务 | 任务编号、目标表名、开始日期 |
| 元数据管理 | `schema` | 字段定义 | 字段编号、所属表名、字段名称 |
| 数据同步 | `datasync` | 同步链路 | 链路编号、源端连接、目标端连接 |
| 快照管理 | `snapshot` | 快照策略 | 策略编号、目标表名、快照周期 |
| 存储治理 | `govern` | 治理策略 | 策略编号、目标表名、治理类型 |
| 任务监控 | `monitor` | 监控配置 | 配置编号、关联任务、监控指标 |
| 变更审计 | `audit` | 审计记录 | 记录编号、操作表名、变更类型 |
| 编目检索 | `catalog` | 编目条目 | 条目编号、数据集名称、所属分层 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。

## 质量校验：判词塔

质量校验页在通用规则表之外多了一层「判词塔」：目标字段在时间切片上逐一叠加校验表达式、阈值、
采样率与阻断级别，塔顶为每个切片落一张带**冲突簇编号**的裁决牌。

- 读写全部在 `frontend/src/api/tower-service.ts`，类型与示例在 `frontend/src/data/tower-types.ts`、
  `tower-seed.ts`，存档在 `data-layer-studio:tower`（与主数据分开，重置主数据不影响封牌历史）。
- **读取口径分离**：应用层发布（ADS）只读 `listTopCards()` 的塔顶牌投影，字段里没有证据明细；
  清洗加工读 `listNeedlesForCleanse()` 返回的被扣留行证据针（正卷）。
- **换阈值不翻案**：`updateThreshold()` 只升塔的生效版本，已封牌切片保留原牌；只有未封牌切片按新
  阈值重算后封牌。
- **同号重放返回原牌**：`sealSlice()` 命中已有封牌号时直接返回原牌，不重新裁决、不追加证据；
  同一落败批次重复争抢也不会重复追加副卷证据。
- **并行争抢只留一个牌根**：同一塔同一时间切片已有牌根时，后到批次不再封牌，其证据整批进入副卷
  （`volume: '副卷'`），牌面只记 `secondaryBatchNo`。
- **回看以质量校验为主对象**：`reviewCard()` 先返回质量规则与塔顶牌的阻断结论，证据针与处置记录
  只作附件。
- **处置记录**：`reconcileDispositions()` 按 `ticket_residue`（残留）、`silent_rule`（不生效）、
  `level_drift`（显示成上一档）、`cluster_shift`（错位）四类核对，每条处置都落处置号（`CZ-xxxx`），
  同一张牌同一类问题重复核对不重复发号。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `data-layer-studio:entries` 这一项，或调用 `resetModule(模块)`。

领域：数据工程
子方向：数仓与数据湖

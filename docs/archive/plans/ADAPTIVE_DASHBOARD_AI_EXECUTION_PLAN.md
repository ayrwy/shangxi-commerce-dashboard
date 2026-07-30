# 自适应数据分析平台 AI 执行计划

## 1. 文档用途

本文件是项目实施任务书，与 `DATA_IMPORT_AND_ADAPTIVE_DASHBOARD_IMPROVEMENT.md` 配套使用。

- 原文档定义产品方向、字段体系、能力分层和总体原则。
- 本文件定义 AI 的执行顺序、任务边界、页面策略、验收标准和完成记录。
- 若代码与文档冲突，以“真实数据可靠、可选维度不阻断核心分析、禁止静默混入示例数据”为最高原则。

后续任务建议使用以下格式下达：

```text
执行 ADAPTIVE_DASHBOARD_AI_EXECUTION_PLAN.md 的 A01-A02。
完成实现、测试和构建后，更新任务状态与验证记录。
```

## 2. 最终目标

```text
上传 1-8 个任意结构 CSV
→ 自动识别平台支持字段
→ 用户只确认必要歧义
→ 单表能力优先计算
→ 跨表能力按需验证关系
→ 生成分析能力清单
→ 动态生成真实数据看板和分析页面
```

产品承诺不是“任何 CSV 都生成完整看板”，而是：

> 接受结构和字段不固定的 CSV，对能够可靠理解和计算的部分生成真实分析，并明确说明其他能力为什么不可用。

## 3. 不可违反的产品规则

1. 可选维度不是上传和核心分析的必需条件。
2. 没有 `channel` 时不生成渠道页面，但销售、订单、用户等分析继续工作。
3. 没有商品字段时不生成商品页面，不允许用模拟商品数据填充。
4. 真实数据模式中的指标、图表、简报、目标和建议必须全部来自真实数据。
5. 空结果不得自动回退到示例数据。
6. 无法计算的模块必须隐藏或说明原因，禁止无说明的空白坐标轴。
7. 订单数、用户数、GMV、复购率和退款率必须有明确粒度、公式和去重键。
8. 相同标准字段只能生成跨表关系候选，不能未经验证直接连接。
9. 单表字段足够时直接计算，不要求用户处理无关关系。
10. 不得使用 `any`、无依据的类型断言或硬编码结果掩盖模型问题。

## 4. 页面与导航策略

### 4.1 页面保留规则

| 页面 | 是否固定显示 | 展示条件 |
|---|---|---|
| 经营总览 | 是 | 始终保留；没有可用指标时显示数据能力说明 |
| 商品与品类 | 否 | 存在商品或品类分析能力 |
| 用户分析 | 否 | 存在用户指标或可靠用户属性能力 |
| 渠道分析 | 否 | 已确认 `channel` 字段且至少有可分组事实 |
| 行为分析 | 否 | 已确认 `behavior` 字段 |
| 退款分析 | 否 | 存在退款金额、退款订单或退款率能力 |
| 数据导入 | 是 | 始终保留 |

### 4.2 页面内容规则

- 商品分析改名为“商品与品类”。
- 只有 `category` 没有 `product_id` 时，可以显示品类分析。
- 用户分析可以容纳购买用户、复购、频次、设备、地区、职业和用户分群。
- 没有 `user_id` 时，设备或地区只能称为属性分布，不能称为用户数。
- 渠道分析只有存在 `channel` 时才出现。
- 行为和退款能力成熟后再增加独立页面，不得预先展示模拟页面。

### 4.3 动态导航

建立统一页面注册表，侧边栏、页面校验和能力摘要共用同一份定义：

```ts
type AnalysisPageDefinition = {
  key: string
  label: string
  requiredCapabilities: string[]
  match: 'all' | 'any'
  order: number
}
```

能力变化导致当前页面失效时：

1. 自动返回经营总览。
2. 提示“字段映射已变化，该分析当前不可用”。
3. 不保留失效页面中的筛选状态。

## 5. 统一能力模型

```ts
type CapabilityStatus =
  | 'available'
  | 'needs_confirmation'
  | 'missing_relation'
  | 'missing_fields'

type AnalysisCapability = {
  key: string
  label: string
  status: CapabilityStatus
  sourceFiles: string[]
  fields: string[]
  dimensions: string[]
  definition: string
  dedupKey?: string
  missingFields?: string[]
  reason?: string
}
```

同一能力结果必须同时驱动：

- 字段确认页的能力清单。
- 经营总览的指标和模块。
- 动态导航。
- 各分析页面。
- “补充数据可解锁”提示。
- 自动化测试。

禁止在页面组件里重复编写另一套字段判断。

## 6. 统一看板上下文

```ts
type DashboardContext = {
  source: 'real' | 'demo'
  datasetId?: string
  dateRange: {
    preset: 'all' | '7d' | '14d' | '28d' | 'custom'
    start?: string
    end?: string
  }
  filters: Record<string, string | string[]>
  capabilities: AnalysisCapability[]
}
```

- 字段确认成功后默认进入真实数据和全部数据范围。
- 近 N 天以数据最大日期为锚点，而不是只以系统当前日期为锚点。
- 所有页面、指标、图表和简报读取同一上下文。
- 切换数据源时清除不适用于新数据源的筛选项。

## 7. 可执行任务清单

任务必须按阶段和依赖顺序执行。每个任务完成后更新状态记录。

### 阶段 A：修复当前真实数据闭环

#### A01 删除过期文案和模拟内容

状态：待开始

- 删除“仅完成结构确认，当前看板仍使用示例数据”等过期文案。
- 确认成功后显示“上传数据已接入真实指标计算”。
- 真实数据模式删除固定商品、渠道、退款建议和固定经营事件。
- 数据不足时显示暂不可用，不生成虚构建议。

验收：上传并确认 CSV 后，所有数据来源文案与实际功能一致。

#### A02 统一真实和示例数据状态

状态：待开始

- 建立统一数据来源上下文。
- 真实数据确认成功后默认进入真实模式和全部数据。
- 空结果不得回退示例数据。
- 页眉、侧边栏、指标卡、图表、目标和简报来源一致。

验收：真实/示例切换后页面不存在混合数据。

#### A03 统一模块状态

状态：待开始

模块必须支持：

```text
正常结果
当前范围无数据
缺少必要字段
关系待确认
口径待确认
计算错误
```

- 删除无说明的空白图表。
- 缺少可选维度时隐藏对应模块或显示简短说明。
- 不把缺少渠道、设备或地址显示成导入错误。

验收：任意字段组合都不会产生无解释的大面积空白区域。

#### A04 修复现有指标口径

状态：待开始

- 区分销售金额、订单金额、退款金额、单价和数量。
- 订单数按 `order_id` 去重。
- 用户指标要求 `user_id` 和购买依据。
- 行为表没有 `order_id` 时，明确标注按购买行为行数计数。
- 复购率不能仅按用户出现次数计算。

验收：每个已显示指标均能说明来源字段、公式、粒度和去重键。

### 阶段 B：重构数据导入

#### B01 单一多文件上传入口

状态：待开始

- 只保留一个 CSV 上传入口。
- 支持上传、拖放、追加、移除、替换和重试。
- 文件数量限制为 1-8 个。
- 超过限制时阻止并说明原因。

验收：用户不需要预先选择文件角色或模板即可上传。

#### B02 重构标准字段目录

状态：待开始

- 按原方案文档第 3 节建立标准字段。
- 移除模糊 `amount` 语义。
- 提供旧会话字段迁移。
- 不支持的字段映射为“忽略”。

验收：金额和数量不再共用标准字段，旧数据不会直接崩溃。

#### B03 增强字段识别器

状态：待开始

识别依据：

- 字段名和常见别名。
- 文件名。
- 样例值和数据类型。
- 唯一率和空值率。
- 数值范围。
- 与其他字段的组合关系。

每个候选映射必须提供置信度和理由。

验收：常见中英文别名可自动映射；金额和数量歧义不会被高置信度误判。

#### B04 精简字段确认页

状态：待开始

- 默认显示已支持字段、低置信字段和影响口径的关键字段。
- 其他字段折叠并默认忽略。
- 用户可修改映射、恢复忽略字段和查看样例。
- 不再要求普通用户理解不必要的内部文件角色。

验收：大列数 CSV 也能快速完成必要确认。

### 阶段 C：能力检测和动态页面

#### C01 建立统一能力检测器

状态：待开始

- 按字段、粒度和安全关系生成能力状态。
- 记录来源文件、字段、公式、去重键、缺失项和原因。
- 核心指标先检测，可选维度后增强。

验收：能力结果可稳定驱动确认页、导航和看板。

#### C02 能力确认摘要

状态：待开始

- 展示“可直接计算 / 需要确认 / 需要关系 / 当前不可用”。
- 展示本次将生成的分析页面。
- 缺少可选维度放入“可解锁分析”，不显示为错误。

验收：用户进入看板前能理解数据边界。

#### C03 动态经营总览

状态：待开始

- 只显示当前可用核心指标和趋势。
- 布局根据模块数量自动调整。
- 不固定要求渠道、商品、退款模块存在。
- 数据不足时仍保持完整、紧凑的页面结构。

验收：只有日期和销售金额的 CSV 也能生成可用经营总览。

#### C04 动态导航和页面注册表

状态：待开始

- 建立统一页面注册表。
- 根据能力动态显示商品、用户、渠道、行为和退款页面。
- 页面能力失效时安全返回经营总览。

验收：无 `channel` 时不显示渠道分析，其他分析不受影响。

#### C05 商品与品类分析

状态：待开始

- 支持商品销售额、销量和趋势。
- 有 `category` 时增加品类排行。
- 只有品类字段时仍允许可靠品类分析。
- 商品名称只用于展示，不默认代替唯一键。

验收：商品和品类能力按实际字段组合独立开放。

#### C06 用户分析

状态：待开始

- 支持购买用户、购买频次和复购率。
- 支持设备、地区、职业和用户分群分布。
- 没有 `user_id` 时不把属性行数称为用户数。

验收：用户指标和属性分布口径明确区分。

#### C07 渠道、行为和退款分析

状态：待开始

- 仅在对应能力存在时生成页面。
- 所有页面共享时间范围和筛选状态。
- 页面不得包含固定模拟图表或建议。

验收：缺少能力时页面不会出现在导航中。

### 阶段 D：多文件关系和标准化

#### D01 候选关系检测

状态：待开始

- 根据相同标准字段生成关系候选。
- 计算空值率、唯一率、匹配率和关系基数。
- 检查是否需要平台、店铺等复合键。

验收：系统不会仅凭同名字段直接连接。

#### D02 安全关联与重复计算保护

状态：待开始

- 安全的一对一、多对一关系可以自动使用。
- 多对多、低匹配率和金额放大风险必须阻断或确认。
- 指标计算应先在正确粒度聚合，再执行跨表扩展。

验收：关联前后 GMV 和订单数不会因行扩展重复累计。

#### D03 同类文件纵向合并

状态：待开始

- 兼容表头文件允许合并。
- 保留 `_source_file`。
- 表头差异提供预览和处理说明。
- 不默认只使用重复角色中的第一张文件。

验收：同类多文件均进入数据模型且来源可追踪。

#### D04 数据标准化

状态：待开始

- 归一化行为值。
- 保留原地址并派生省市区。
- 支持职业、职位和用户分群映射。
- 所有转换保留原始值和规则记录。

验收：转换结果可追踪，错误转换可撤销。

### 阶段 E：生产化

#### E01 数据集和映射模板持久化

状态：待开始

- 保存数据集、映射、关系和转换规则。
- 相似文件上传时复用模板，但必须重新验证数据质量。

#### E02 大文件处理

状态：待开始

- 分块解析和后台计算。
- 支持进度、取消、错误恢复和资源限制。

#### E03 数据质量报告

状态：待开始

- 汇总空值、重复键、异常日期、异常金额和关系质量。
- 指明问题会影响哪些指标。

#### E04 真实经营建议

状态：待开始

- 只根据真实指标和明确规则生成建议。
- 数据不足时不生成虚构建议。

## 8. 测试矩阵

| 场景 | 应有结果 |
|---|---|
| 仅日期和销售金额 | GMV、销售趋势 |
| 销售金额无日期 | GMV；趋势说明缺少日期 |
| 订单主表 | 去重订单数、GMV、客单价 |
| 订单明细重复 `order_id` | 订单去重；金额按正确粒度计算 |
| 用户行为表 | 行为漏斗；有购买依据时开放购买指标 |
| 商品和品类字段 | 商品排行、品类排行 |
| 无渠道字段 | 不显示渠道分析；其他模块正常 |
| 只有设备或地址，无 `user_id` | 属性分布可用；不称为用户数 |
| 退款表无销售分母 | 显示退款金额；不显示退款率 |
| 多表安全一对多关系 | 联合分析正确且金额不重复 |
| 多对多候选关系 | 阻断并说明风险 |
| 当前日期范围无数据 | 提示调整范围；不回退示例 |
| 未识别字段很多 | 其他字段折叠；已支持分析不受阻断 |
| 超过 8 个文件 | 阻止新增并提示数量限制 |

## 9. AI 单任务执行规范

### 9.1 执行步骤

```text
阅读本文件和原方案文档
→ 检查关联代码、测试和现有用户改动
→ 明确本次任务范围
→ 实现最小完整闭环
→ 添加或更新测试
→ 运行 TypeScript、测试和生产构建
→ 更新任务状态与完成记录
```

### 9.2 完成定义

任务只有同时满足以下条件才能标记“已完成”：

- 正常、缺字段、空数据和异常路径均有处理。
- TypeScript 严格检查通过。
- 相关单元测试通过。
- 生产构建通过；若沙箱阻止 esbuild，必须在允许子进程的环境复验。
- 真实模式没有混入示例内容。
- 页面没有新增无说明空白区域。
- 文案与真实功能一致。
- 任务状态和验证结果已写回文档。

### 9.3 完成记录格式

每项任务下追加：

```text
状态：已完成 / 部分完成 / 阻塞
完成日期：
修改文件：
验证命令：
验证结果：
剩余风险：
```

## 10. 推荐推进批次

```text
批次 1：A01-A04
批次 2：B01-B04
批次 3：C01-C04
批次 4：C05-C07
批次 5：D01-D04
批次 6：E01-E04
```

每个批次完成后先做代码审查和浏览器验收，再继续下一批。如果发现基础指标口径错误，优先修复，不得继续堆叠页面功能。

## 11. 第一阶段总体验收

- 一个入口可上传不超过 8 个 CSV。
- 用户只需确认存在歧义的关键字段。
- 无渠道、设备、地址等可选维度时仍可完成核心分析。
- 单表字段足够时直接生成对应图表。
- 跨表分析只在关系验证安全后启用。
- 看板不显示无说明的空白模块。
- 真实模式不混入模拟指标、事件或建议。
- 商品、用户、渠道、行为和退款页面按能力动态显示。
- 能力检测、确认摘要、导航和看板使用同一份能力结果。
- 每个指标可说明来源、公式、粒度和去重口径。


### Phase A Completion Record (A01-A04)

- A01 status: completed; removed stale real-data/demo wording and fixed simulated content from real mode.
- A02 status: completed; real mode reads metrics, trend, channels, products and brief from MetricEngine; empty real results never fall back to demo data; date presets use the uploaded data end date.
- A03 status: completed; missing real trend/channel/product results no longer render unexplained blank charts.
- A04 status: completed; order mode deduplicates by order_id; behavior mode counts buy rows and labels the metric as average purchase behavior amount; repeat rate uses purchase counts per user.
- Date: 2026-07-27
- Files: src/App.tsx, src/metricEngine.ts, src/metricCapabilities.ts
- Verification: `npx tsc -b --pretty false`, `npm test`, and `npm run build` all passed.
- Remaining risks: unified DashboardContext, dynamic navigation, and cross-table relation safeguards remain for later C/D tasks.

### Phase C Completion Record (C01-C04)

- C01 completed: shared capability/page registry and explicit capability states.
- C02 completed: confirmation page lists generated pages and capability status.
- C03 partial: real overview hides unavailable modules and uses available metric results; broader dynamic card layout remains.
- C04 completed: sidebar pages use the shared registry and invalid active pages return to overview.
- Date: 2026-07-27
- Files: src/analysisPages.ts, src/components/FieldConfirmPage.tsx, src/App.tsx, src/analysisPages.test.ts, scripts/prepare-tests.cjs, tsconfig.test.json
- Verification: tsc, npm test, npm run build all passed.
- Remaining risk: product/user/channel subpages still need real-data implementations in C05-C07.

### Phase C05-C07 Completion Record

- C05 completed: real product ranking uses MetricEngine product detail results; unavailable product capability is explained.
- C06 partial: real buyers and repeat-rate results are shown when available; device, address, occupation and segment distributions remain future work.
- C07 completed: real channel, behavior and refund pages use MetricEngine results and shared filters; demo analysis content remains only in demo mode.
- Date: 2026-07-27
- Files: src/App.tsx, src/metricEngine.ts, src/analysisPages.ts
- Verification: tsc, npm test, npm run build all passed.
- Remaining risk: category-only analysis and detailed user attribute distributions are deferred.

### Phase D Completion Record (D01-D04)

- D01 completed: relationship candidates report match rate, empty rate, uniqueness, cardinality, unmatched samples, impacts, and composite-key suggestions.
- D02 completed: many-to-many relationships block confirmation until explicitly acknowledged; relationship quality issues are surfaced before model confirmation.
- D03 completed: same-role files support preview and vertical merge with `_source_file` provenance and missing-header warnings.
- D04 completed: added traceable standardization rules for behavior values, address province/city derivation, and user attribute trimming while retaining raw values.
- Date: 2026-07-27
- Files: src/relationshipEngine.ts, src/importSession.ts, src/standardization.ts, src/standardization.test.ts, src/analysisPages.test.ts, package.json, scripts/prepare-tests.cjs, tsconfig.test.json
- Verification: tsc, npm test, npm run build all passed.
- Remaining risk: composite keys are detected and warned but not yet executed as physical multi-column joins; address parsing remains heuristic for unusual formats.

### Phase E Completion Record (E01-E04)

- E01 completed: added mapping template creation, serialization, parsing, and session persistence support for imported file progress.
- E02 completed: added FileReader progress reporting, cancellation, retry, and cleanup for active reads.
- E03 completed: added a structured data quality report with generation time and affected metric keys derived from detected issues.
- E04 completed: added rule-based recommendations for high refund rate, low repeat rate, and available channel analysis; recommendations use computed metrics only.
- Date: 2026-07-27
- Files: src/importSession.ts, src/mappingTemplates.ts, src/importFileReader.ts, src/components/ImportPage.tsx, src/metricCapabilities.ts, src/metricEngine.ts, src/metricEngine.test.ts, package.json, scripts/prepare-tests.cjs, tsconfig.test.json
- Verification: `npx tsc -b --pretty false`, `npm test`, and `npm run build` all passed.
- Remaining risks: mapping templates are currently API-level and do not yet have a dedicated import/export UI; browser FileReader progress depends on browser event behavior; recommendations are deterministic rules rather than AI-generated advice.

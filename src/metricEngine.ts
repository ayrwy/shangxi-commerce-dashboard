import type { AnalysisModel, AnalysisTable } from './analysisModel'
import { columnIndexOf, columnValuesByCanonical, distinctValues, hasCanonical, numericColumnValues, resolveDisplayValue, tableByRole, tablesWithFields } from './analysisModel'

export type MetricFilters = {
  channel?: string
  dateStart?: string
  dateEnd?: string
  behavior?: string
}

export type MetricResult = {
  key: string
  label: string
  value: number | null
  formatted: string
  definition: { source: string; granularity: string; formula: string; dedupKey: string }
  available: boolean
  reason?: string
}

export type MetricRecommendation = { key: string; title: string; detail: string; metricKeys: string[] }
export type RfmSegment = { segment: string; users: number; share: number; avgRecency: number; avgFrequency: number; avgMonetary: number }

export const recommendationsFromMetrics = (metrics: MetricResult[]): MetricRecommendation[] => {
  const result: MetricRecommendation[] = []
  const refund = metrics.find(metric => metric.key === 'refund_amount_rate')
  const repeat = metrics.find(metric => metric.key === 'repeat_rate')
  const channel = metrics.find(metric => metric.key === 'channel')
  if (refund?.available && refund.value !== null && refund.value >= 5) result.push({ key: 'refund-rate-high', title: '优先检查退款原因', detail: `金额退款率为 ${refund.formatted}，建议按商品和订单明细定位异常原因。`, metricKeys: ['refund_amount_rate'] })
  if (repeat?.available && repeat.value !== null && repeat.value < 20) result.push({ key: 'repeat-rate-low', title: '关注复购用户', detail: `复购率为 ${repeat.formatted}，建议检查首购后的触达和复购路径。`, metricKeys: ['repeat_rate'] })
  if (channel?.available) result.push({ key: 'channel-review', title: '复核渠道贡献', detail: '渠道能力可用，建议按渠道对比成交额和订单量，再决定预算调整。', metricKeys: ['channel'] })
  return result
}

const numeric = (value: string) => Number((value ?? '').replace(/[,\u00a5$￥]/g, '')) || 0

const colIndex = (table: AnalysisTable | undefined, canonical: string) => table ? columnIndexOf(table, canonical) : undefined

const rowValue = (row: string[], index: number | undefined) => index !== undefined && index >= 0 ? (row[index] ?? '').trim() : ''

const filterRows = (rows: string[][], table: AnalysisTable, filters: MetricFilters): string[][] => {
  let result = rows
  const channelIdx = colIndex(table, 'channel')
  if (filters.channel && channelIdx !== undefined) {
    result = result.filter(row => rowValue(row, channelIdx) === filters.channel)
  }
  const dateIdx = colIndex(table, 'datetime') ?? colIndex(table, 'created_at')
  if (dateIdx !== undefined && (filters.dateStart || filters.dateEnd)) {
    result = result.filter(row => {
      const v = rowValue(row, dateIdx)
      const d = Date.parse(v)
      if (Number.isNaN(d)) return true
      if (filters.dateStart && d < Date.parse(filters.dateStart)) return false
      if (filters.dateEnd && d > Date.parse(filters.dateEnd + 'T23:59:59')) return false
      return true
    })
  }
  return result
}

type MetricDef = { key: string; label: string; source: string; granularity: string; formula: string; dedupKey: string }

const metricDefinitions: Record<string, MetricDef> = {
  gmv: { key: 'gmv', label: '销售额 GMV', source: '订单主表或行为表', granularity: '订单/行为', formula: '订单：去重 order_id 汇总 order_amount；行为：behavior=buy 的 price×amount 求和', dedupKey: 'order_id' },
  orders: { key: 'orders', label: '支付订单', source: '订单主表', granularity: '订单', formula: '去重 order_id 计数', dedupKey: 'order_id' },
  buyers: { key: 'buyers', label: '购买用户数', source: '订单主表或行为表', granularity: '用户', formula: '去重 user_id 计数', dedupKey: 'user_id' },
  average_order_value: { key: 'average_order_value', label: '客单价', source: '订单主表或行为表', granularity: '订单/购买行为', formula: '订单：GMV / 去重订单量；行为：buy 行 GMV / buy 行数', dedupKey: 'order_id 或 buy 行数' },
  detail_sales: { key: 'detail_sales', label: '明细销售额', source: '订单明细', granularity: '订单商品行', formula: '所有行的 price×amount 求和', dedupKey: '行级' },
  product_rank: { key: 'product_rank', label: '商品排行', source: '订单明细', granularity: '商品', formula: '按 product_id 汇总数量和销售额', dedupKey: 'product_id' },
  category_rank: { key: 'category_rank', label: '类目排行', source: '订单明细', granularity: '类目', formula: '按 category 汇总数量和销售额', dedupKey: 'category' },
  channel: { key: 'channel', label: '渠道贡献', source: '行为表或订单表', granularity: '渠道', formula: '按 channel 分组汇总 GMV', dedupKey: 'channel' },
  refund_amount_rate: { key: 'refund_amount_rate', label: '金额退款率', source: '退款表+订单表', granularity: '退款金额/订单GMV', formula: '退款金额 / GMV × 100%', dedupKey: '退款按行汇总；GMV按order_id去重' },
  refund_order_rate: { key: 'refund_order_rate', label: '订单退款率', source: '退款表+订单表', granularity: '退款订单/全部订单', formula: '去重退款order_id数 / 去重支付order_id数 × 100%', dedupKey: 'order_id去重' },
  repeat_rate: { key: 'repeat_rate', label: '复购率', source: '订单主表或行为表', granularity: '用户', formula: '多次购买用户数 / 购买用户数 × 100%', dedupKey: 'user_id+时间排序' },
  funnel: { key: 'funnel', label: '行为漏斗', source: '用户行为表', granularity: '行为值', formula: '按行为值分布统计', dedupKey: 'behavior' },
  user_dimensions: { key: 'user_dimensions', label: '用户属性分布', source: '用户行为表或用户表', granularity: '用户属性', formula: '按 address、device、province、city 等维度统计记录分布', dedupKey: '属性记录；没有 user_id 时不代表去重用户数' },
  rfm: { key: 'rfm', label: 'RFM 用户分层', source: '用户行为表、订单主表或订单明细', granularity: '用户', formula: '按最近购买时间、购买频次和累计金额给用户评分并分层', dedupKey: 'user_id' },
}

export class MetricEngine {
  private readonly cache = new Map<string, unknown>()

  constructor(public model: AnalysisModel) { }

  private cached<T>(key: string, filters: MetricFilters, compute: () => T): T {
    const cacheKey = `${this.model.cacheKey}:${key}:${JSON.stringify(filters)}`
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as T
    const value = compute()
    this.cache.set(cacheKey, value)
    return value
  }

  private rankingTable(identifier: string): AnalysisTable | undefined {
    return tablesWithFields(this.model, identifier)
      .filter(table => hasCanonical(table, 'price', 'amount') || table.role === 'behavior')
      .sort((left, right) => {
        const score = (table: AnalysisTable) => (hasCanonical(table, 'price', 'amount') ? 2 : 0) + (table.role === 'order_items' ? 2 : 0) + (table.role === 'behavior' ? 1 : 0)
        return score(right) - score(left)
      })[0]
  }

  private rankingRows(identifier: 'product_id' | 'category', filters: MetricFilters) {
    const table = this.rankingTable(identifier)
    if (!table) return []
    const identifierIdx = colIndex(table, identifier)
    if (identifierIdx === undefined) return []
    const priceIdx = colIndex(table, 'price')
    const amountIdx = colIndex(table, 'amount')
    const behaviorIdx = colIndex(table, 'behavior')
    const source = table.columns[identifierIdx]!.source
    const map = new Map<string, { salesAmount: number; salesVolume: number }>()
    filterRows(table.rows, table, filters).forEach(row => {
      if (table.role === 'behavior' && behaviorIdx !== undefined && !['buy', 'purchase', 'payment', '购买'].includes(rowValue(row, behaviorIdx))) return
      const rawId = rowValue(row, identifierIdx)
      if (!rawId) return
      const entry = map.get(rawId) ?? { salesAmount: 0, salesVolume: 0 }
      entry.salesAmount += priceIdx !== undefined && amountIdx !== undefined ? numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? '') : 0
      entry.salesVolume += amountIdx !== undefined ? numeric(row[amountIdx] ?? '') : 1
      map.set(rawId, entry)
    })
    return [...map.entries()]
      // Labels come from any confirmed dimension relationship, regardless of
      // the concrete domain (category, brand, region, store, ...).
      .map(([rawId, value]) => ({ rawId, displayName: resolveDisplayValue(this.model, table.id, source, rawId), ...value }))
      .sort((left, right) => right.salesAmount - left.salesAmount || right.salesVolume - left.salesVolume)
      .slice(0, 10)
  }

  compute(key: string, filters: MetricFilters = {}): MetricResult {
    const def = metricDefinitions[key]
    if (!def) return { key, label: key, value: null, formatted: '—', definition: { source: '', granularity: '', formula: '', dedupKey: '' }, available: false, reason: '未知指标' }
    switch (key) {
      case 'gmv': return this.computeGmv(filters)
      case 'orders': return this.computeOrders(filters)
      case 'buyers': return this.computeBuyers(filters)
      case 'average_order_value': return this.computeAov(filters)
      case 'detail_sales': return this.computeDetailSales(filters)
      case 'product_rank': return this.computeProductRank(filters)
      case 'category_rank': return this.computeCategoryRank(filters)
      case 'channel': return this.computeChannel(filters)
      case 'refund_amount_rate': return this.computeRefundAmountRate(filters)
      case 'refund_order_rate': return this.computeRefundOrderRate(filters)
      case 'repeat_rate': return this.computeRepeatRate(filters)
      case 'funnel': return this.computeFunnel(filters)
      case 'user_dimensions': return this.computeUserDimensions(filters)
      case 'rfm': return this.computeRfm(filters)
      default: return { key, label: def.label, value: null, formatted: '—', definition: def, available: false, reason: '未实现' }
    }
  }

  private result(key: string, value: number | null, formatted: string, available: boolean, reason?: string): MetricResult {
    const def = metricDefinitions[key]
    const label = key === 'average_order_value' && this.model.mode === 'behavior' ? '\u5e73\u5747\u8d2d\u4e70\u884c\u4e3a\u91d1\u989d' : def.label
    return { key, label, value, formatted, definition: def, available, reason }
  }

  computeGmv(filters: MetricFilters): MetricResult {
    if (this.model.mode === 'behavior') {
      const behavior = tableByRole(this.model, 'behavior')
      if (!hasCanonical(behavior, 'behavior', 'price', 'amount')) return this.result('gmv', null, '—', false, '缺少 behavior、price 或 amount')
      const priceIdx = colIndex(behavior, 'price')
      const amountIdx = colIndex(behavior, 'amount')
      const behIdx = colIndex(behavior, 'behavior')
      if (priceIdx === undefined || amountIdx === undefined || behIdx === undefined) return this.result('gmv', null, '—', false, '字段索引缺失')
      let baseRows = behavior!.rows
      if (filters.behavior) baseRows = baseRows.filter(row => rowValue(row, behIdx) === filters.behavior)
      const rows = filterRows(baseRows, behavior!, filters)
      const buyRows = rows.filter(row => rowValue(row, behIdx) === 'buy' || rowValue(row, behIdx) === '购买')
      const gmv = buyRows.reduce((sum, row) => sum + numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? ''), 0)
      return this.result('gmv', gmv, '¥' + gmv.toLocaleString(), true)
    }
    const orders = tableByRole(this.model, 'orders')
    if (!orders || !hasCanonical(orders, 'order_amount')) return this.result('gmv', null, '—', false, '缺少 order_amount')
    const amountIdx = colIndex(orders, 'order_amount')
    const oidIdx = colIndex(orders, 'order_id')
    if (amountIdx === undefined) return this.result('gmv', null, '—', false, '字段索引缺失')
    const rows = filterRows(orders.rows, orders, filters)
    const seen = new Set<string>()
    let gmv = 0
    for (const row of rows) {
      if (oidIdx !== undefined) {
        const oid = rowValue(row, oidIdx)
        if (seen.has(oid)) continue
        seen.add(oid)
      }
      gmv += numeric(row[amountIdx] ?? '')
    }
    return this.result('gmv', gmv, '¥' + gmv.toLocaleString(), true)
  }

  computeOrders(filters: MetricFilters): MetricResult {
    if (this.model.mode === 'behavior') {
      const behavior = tableByRole(this.model, 'behavior')
      if (!behavior || !hasCanonical(behavior, 'behavior')) return this.result('orders', null, '—', false, '缺少 behavior')
      const behIdx = colIndex(behavior, 'behavior')!
      const rows = filterRows(behavior.rows, behavior, filters)
      const buyRows = rows.filter(row => rowValue(row, behIdx) === 'buy' || rowValue(row, behIdx) === '购买')
      const oidIdx = colIndex(behavior, 'order_id')
      if (oidIdx !== undefined) {
        const distinctOrderIds = distinctValues(buyRows.map(r => rowValue(r, oidIdx)).filter(Boolean))
        return this.result('orders', distinctOrderIds.length, distinctOrderIds.length.toLocaleString(), true)
      }
      return this.result('orders', buyRows.length, buyRows.length.toLocaleString() + ' 行（无order_id，按购买行为计数）', true)
    }
    const orders = tableByRole(this.model, 'orders')
    if (!orders || !hasCanonical(orders, 'order_id')) {
      const items = tableByRole(this.model, 'order_items')
      if (items && hasCanonical(items, 'order_id')) {
        const oidIdx = colIndex(items, 'order_id')!
        const rows = filterRows(items.rows, items, filters)
        const count = distinctValues(rows.map(r => rowValue(r, oidIdx))).length
        return this.result('orders', count, count.toLocaleString(), true)
      }
      return this.result('orders', null, '—', false, '缺少 order_id')
    }
    const oidIdx = colIndex(orders, 'order_id')!
    const rows = filterRows(orders.rows, orders, filters)
    const count = distinctValues(rows.map(r => rowValue(r, oidIdx))).length
    return this.result('orders', count, count.toLocaleString(), true)
  }

  computeBuyers(filters: MetricFilters): MetricResult {
    if (this.model.mode === 'behavior') {
      const behavior = tableByRole(this.model, 'behavior')
      if (!behavior || !hasCanonical(behavior, 'user_id', 'behavior')) return this.result('buyers', null, '—', false, '缺少 user_id')
      const uidIdx = colIndex(behavior, 'user_id')!
      const behIdx = colIndex(behavior, 'behavior')!
      const rows = filterRows(behavior.rows, behavior, filters)
      const buyers = distinctValues(rows.filter(r => rowValue(r, behIdx) === 'buy' || rowValue(r, behIdx) === '购买').map(r => rowValue(r, uidIdx))).length
      return this.result('buyers', buyers, buyers.toLocaleString(), true)
    }
    const orders = tableByRole(this.model, 'orders')
    if (!orders) return this.result('buyers', null, '—', false, '缺少订单表')
    if (!hasCanonical(orders, 'user_id')) {
      const items = tableByRole(this.model, 'order_items')
      if (items && hasCanonical(items, 'user_id')) {
        const uidIdx = colIndex(items, 'user_id')!
        const rows = filterRows(items.rows, items, filters)
        const count = distinctValues(rows.map(r => rowValue(r, uidIdx))).length
        return this.result('buyers', count, count.toLocaleString(), true)
      }
      return this.result('buyers', null, '—', false, '缺少 user_id')
    }
    const uidIdx = colIndex(orders, 'user_id')!
    const rows = filterRows(orders.rows, orders, filters)
    const count = distinctValues(rows.map(r => rowValue(r, uidIdx))).length
    return this.result('buyers', count, count.toLocaleString(), true)
  }

  computeAov(filters: MetricFilters): MetricResult {
    const gmvResult = this.computeGmv(filters)
    const ordersResult = this.computeOrders(filters)
    if (this.model.mode === 'behavior') {
      if (gmvResult.value === null || ordersResult.value === null || ordersResult.value === 0) return this.result('average_order_value', null, '\u2014', false, '\u6ca1\u6709\u53ef\u7528\u7684 buy \u884c\u6570\u636e')
      const averageBehaviorAmount = gmvResult.value / ordersResult.value
      return this.result('average_order_value', averageBehaviorAmount, '\u00a5' + averageBehaviorAmount.toFixed(2), true)
    }
    if (gmvResult.value === null || ordersResult.value === null || ordersResult.value === 0) return this.result('average_order_value', null, '\u2014', false, 'GMV \u6216\u8ba2\u5355\u91cf\u4e0d\u53ef\u7528')
    const aov = gmvResult.value / ordersResult.value
    return this.result('average_order_value', aov, '\u00a5' + aov.toFixed(2), true)
  }
  computeDetailSales(filters: MetricFilters): MetricResult {
    const items = tableByRole(this.model, 'order_items')
    const wide = tableByRole(this.model, 'orders') // order_wide is stored as orders role
    const table = items ?? (hasCanonical(wide, 'price', 'amount') ? wide : undefined)
    if (!table || !hasCanonical(table, 'price', 'amount')) return this.result('detail_sales', null, '—', false, '缺少 price 或 amount')
    const priceIdx = colIndex(table, 'price')!
    const amountIdx = colIndex(table, 'amount')!
    const rows = filterRows(table.rows, table, filters)
    const total = rows.reduce((sum, row) => sum + numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? ''), 0)
    return this.result('detail_sales', total, '¥' + total.toLocaleString(), true)
  }

  computeProductRank(filters: MetricFilters): MetricResult {
    const genericRank = this.rankingRows('product_id', filters)
    if (genericRank.length > 0) return this.result('product_rank', genericRank.length, genericRank.map((row, index) => `${index + 1}. ${row.displayName} ¥${row.salesAmount.toLocaleString()} (${row.salesVolume})`).join('\n'), true)
    if (this.model.mode === 'behavior') return this.result('product_rank', null, '—', false, '行为模式不支持商品排行')
    const table = this.rankingTable('product_id')
    if (!table || !hasCanonical(table, 'product_id', 'price', 'amount')) return this.result('product_rank', null, '—', false, '缺少 product_id 或价格数量')
    const pidIdx = colIndex(table, 'product_id')!
    const priceIdx = colIndex(table, 'price')!
    const amountIdx = colIndex(table, 'amount')!
    const rows = filterRows(table.rows, table, filters)
    const map = new Map<string, { volume: number; amount: number }>()
    for (const row of rows) {
      const pid = rowValue(row, pidIdx)
      if (!pid) continue
      const entry = map.get(pid) ?? { volume: 0, amount: 0 }
      entry.volume += numeric(row[amountIdx] ?? '')
      entry.amount += numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? '')
      map.set(pid, entry)
    }
    const rank = [...map.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 10)
    const formatted = rank.map(([pid, v], i) => (i + 1) + '. ' + pid + ' ¥' + v.amount.toLocaleString() + '(' + v.volume + '件)').join('\n')
    return this.result('product_rank', rank.length, formatted, true)
  }

  computeCategoryRank(filters: MetricFilters): MetricResult {
    const genericRank = this.rankingRows('category', filters)
    if (genericRank.length > 0) return this.result('category_rank', genericRank.length, genericRank.map((row, index) => `${index + 1}. ${row.displayName} ¥${row.salesAmount.toLocaleString()} (${row.salesVolume})`).join('\n'), true)
    const behavior = tableByRole(this.model, 'behavior')
    const table = this.rankingTable('category')
    if (!table || !hasCanonical(table, 'category')) return this.result('category_rank', null, '—', false, '缺少 category_id')
    const categoryIdx = colIndex(table, 'category')!
    const priceIdx = colIndex(table, 'price')
    const amountIdx = colIndex(table, 'amount')
    const rows = filterRows(table.rows, table, filters).filter(row => table !== behavior || ['buy', '购买', 'purchase', 'payment'].includes(rowValue(row, colIndex(behavior, 'behavior'))))
    const map = new Map<string, { salesAmount: number; salesVolume: number }>()
    rows.forEach(row => {
      const category = rowValue(row, categoryIdx)
      if (!category) return
      const entry = map.get(category) ?? { salesAmount: 0, salesVolume: 0 }
      entry.salesAmount += priceIdx !== undefined && amountIdx !== undefined ? numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? '') : 0
      entry.salesVolume += amountIdx !== undefined ? numeric(row[amountIdx] ?? '') : 1
      map.set(category, entry)
    })
    return this.result('category_rank', map.size, [...map.entries()].sort((a, b) => b[1].salesAmount - a[1].salesAmount).slice(0, 10).map(([key, value], index) => `${index + 1}. ${key} ¥${value.salesAmount.toLocaleString()}（${value.salesVolume}件）`).join('\n'), true)
  }

  getCategoryRanking(filters: MetricFilters = {}): { category: string; categoryId: string; salesAmount: number; salesVolume: number }[] {
    const genericRank = this.rankingRows('category', filters)
    if (genericRank.length > 0) return this.cached('category-ranking', filters, () => genericRank.map(row => ({ category: row.displayName, categoryId: row.rawId, salesAmount: row.salesAmount, salesVolume: row.salesVolume })))
    const behavior = tableByRole(this.model, 'behavior')
    const table = this.rankingTable('category')
    if (!table || !hasCanonical(table, 'category')) return []
    const categoryIdx = colIndex(table, 'category')!
    const priceIdx = colIndex(table, 'price')
    const amountIdx = colIndex(table, 'amount')
    const map = new Map<string, { salesAmount: number; salesVolume: number }>()
    filterRows(table.rows, table, filters).filter(row => table !== behavior || ['buy', '购买', 'purchase', 'payment'].includes(rowValue(row, colIndex(behavior, 'behavior')))).forEach(row => {
      const category = rowValue(row, categoryIdx)
      if (!category) return
      const entry = map.get(category) ?? { salesAmount: 0, salesVolume: 0 }
      entry.salesAmount += priceIdx !== undefined && amountIdx !== undefined ? numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? '') : 0
      entry.salesVolume += amountIdx !== undefined ? numeric(row[amountIdx] ?? '') : 1
      map.set(category, entry)
    })
    return [...map.entries()].map(([category, value]) => ({ category, categoryId: category, ...value })).sort((a, b) => b.salesAmount - a.salesAmount).slice(0, 10)
  }

  computeChannel(filters: MetricFilters): MetricResult {
    const behavior = tableByRole(this.model, 'behavior')
    const orders = tableByRole(this.model, 'orders')
    const table = behavior ?? orders
    if (!table || !hasCanonical(table, 'channel')) return this.result('channel', null, '—', false, '缺少 channel')
    const chIdx = colIndex(table, 'channel')!
    const rows = filterRows(table.rows, table, filters)
    const channels = distinctValues(rows.map(r => rowValue(r, chIdx)))
    return this.result('channel', channels.length, channels.length + ' 个渠道', true)
  }

  computeRefundAmountRate(filters: MetricFilters): MetricResult {
    const refunds = tableByRole(this.model, 'refunds')
    if (!refunds || !hasCanonical(refunds, 'refund_amount')) return this.result('refund_amount_rate', null, '—', false, '缺少退款表或 refund_amount')
    const amountIdx = colIndex(refunds, 'refund_amount')!
    const rows = filterRows(refunds.rows, refunds, filters)
    const refundAmount = rows.reduce((sum, row) => sum + numeric(row[amountIdx] ?? ''), 0)
    const gmvResult = this.computeGmv(filters)
    if (gmvResult.value === null || gmvResult.value === 0) return this.result('refund_amount_rate', null, '—', false, 'GMV 不可用')
    const rate = refundAmount / gmvResult.value * 100
    return this.result('refund_amount_rate', rate, rate.toFixed(2) + '%', true)
  }

  computeRefundOrderRate(filters: MetricFilters): MetricResult {
    const refunds = tableByRole(this.model, 'refunds')
    if (!refunds || !hasCanonical(refunds, 'order_id')) return this.result('refund_order_rate', null, '—', false, '缺少退款表 order_id')
    const oidIdx = colIndex(refunds, 'order_id')!
    const rows = filterRows(refunds.rows, refunds, filters)
    const refundOrderCount = distinctValues(rows.map(r => rowValue(r, oidIdx))).length
    const ordersResult = this.computeOrders(filters)
    if (ordersResult.value === null || ordersResult.value === 0) return this.result('refund_order_rate', null, '—', false, '订单量不可用')
    const rate = refundOrderCount / ordersResult.value * 100
    return this.result('refund_order_rate', rate, rate.toFixed(2) + '%', true)
  }

  computeRepeatRate(filters: MetricFilters): MetricResult {
    if (this.model.mode === 'behavior') {
      const behavior = tableByRole(this.model, 'behavior')
      if (!behavior || !hasCanonical(behavior, 'user_id', 'behavior')) return this.result('repeat_rate', null, '—', false, '缺少 user_id')
      const uidIdx = colIndex(behavior, 'user_id')!
      const behIdx = colIndex(behavior, 'behavior')!
      const dateIdx = colIndex(behavior, 'datetime') ?? colIndex(behavior, 'created_at')
      const rows = filterRows(behavior.rows, behavior, filters)
      const buyUsers = new Map<string, number>()
      for (const row of rows) {
        const beh = rowValue(row, behIdx)
        if (beh !== 'buy' && beh !== '购买') continue
        const uid = rowValue(row, uidIdx)
        if (!uid) continue
        buyUsers.set(uid, (buyUsers.get(uid) ?? 0) + 1)
      }
      const repeat = [...buyUsers.values()].filter(c => c >= 2).length
      if (buyUsers.size === 0) return this.result('repeat_rate', null, '—', false, '没有购买用户')
      return this.result('repeat_rate', repeat / buyUsers.size * 100, (repeat / buyUsers.size * 100).toFixed(1) + '%', true)
    }
    const orders = tableByRole(this.model, 'orders')
    if (!orders || !hasCanonical(orders, 'user_id')) return this.result('repeat_rate', null, '—', false, '缺少 user_id')
    const uidIdx = colIndex(orders, 'user_id')!
    const rows = filterRows(orders.rows, orders, filters)
    const userOrders = new Map<string, number>()
    for (const row of rows) {
      const uid = rowValue(row, uidIdx)
      if (!uid) continue
      userOrders.set(uid, (userOrders.get(uid) ?? 0) + 1)
    }
    const repeat = [...userOrders.values()].filter(c => c >= 2).length
    if (userOrders.size === 0) return this.result('repeat_rate', null, '—', false, '没有订单用户')
    return this.result('repeat_rate', repeat / userOrders.size * 100, (repeat / userOrders.size * 100).toFixed(1) + '%', true)
  }

  computeFunnel(filters: MetricFilters): MetricResult {
    const behavior = tableByRole(this.model, 'behavior')
    if (!behavior || !hasCanonical(behavior, 'behavior')) return this.result('funnel', null, '—', false, '缺少 behavior')
    const behIdx = colIndex(behavior, 'behavior')!
    const rows = filterRows(behavior.rows, behavior, filters)
    const counts = new Map<string, number>()
    for (const row of rows) {
      const beh = rowValue(row, behIdx)
      if (!beh) continue
      counts.set(beh, (counts.get(beh) ?? 0) + 1)
    }
    const total = rows.length
    return this.result('funnel', total, total.toLocaleString(), true)
  }

  computeUserDimensions(filters: MetricFilters): MetricResult {
    const table = tableByRole(this.model, 'behavior') ?? tableByRole(this.model, 'orders') ?? tableByRole(this.model, 'users')
    if (!table || !['address', 'device', 'province', 'city'].some(key => hasCanonical(table, key))) return this.result('user_dimensions', null, '—', false, '缺少 address、device、province 或 city')
    const distributions = this.getDimensionDistribution(filters)
    const total = Object.values(distributions).reduce((sum, values) => sum + values.length, 0)
    return this.result('user_dimensions', total, total.toLocaleString() + ' 条属性分布', true)
  }

  computeRfm(filters: MetricFilters): MetricResult {
    const segments = this.getRfmSegments(filters)
    if (segments.length === 0) return this.result('rfm', null, '—', false, '缺少 user_id、时间或可计算金额字段')
    const users = segments.reduce((sum, item) => sum + item.users, 0)
    return this.result('rfm', users, users.toLocaleString() + ' 位用户', true)
  }

  getRfmSegments(filters: MetricFilters = {}): RfmSegment[] {
    const behavior = tableByRole(this.model, 'behavior')
    const orders = tableByRole(this.model, 'orders')
    const items = tableByRole(this.model, 'order_items')
    const hasTime = (candidate: AnalysisTable | undefined) => Boolean(candidate && hasCanonical(candidate, 'user_id') && (hasCanonical(candidate, 'datetime') || hasCanonical(candidate, 'created_at')))
    const table = hasTime(behavior) ? behavior : hasTime(orders) ? orders : hasTime(items) ? items : undefined
    if (!table) return []
    const userIdx = colIndex(table, 'user_id')!
    const dateIdx = colIndex(table, 'datetime') ?? colIndex(table, 'created_at')
    const orderIdx = colIndex(table, 'order_id')
    const amountIdx = colIndex(table, 'amount')
    const priceIdx = colIndex(table, 'price')
    const orderAmountIdx = colIndex(table, 'order_amount')
    const behaviorIdx = colIndex(table, 'behavior')
    if (dateIdx === undefined || (orderAmountIdx === undefined && (priceIdx === undefined || amountIdx === undefined))) return []
    let rows = filterRows(table.rows, table, filters)
    if (table === behavior && behaviorIdx !== undefined) rows = rows.filter(row => ['buy', '购买', 'purchase', 'payment'].includes(rowValue(row, behaviorIdx).toLowerCase()))
    const parsed = rows.map(row => ({ row, user: rowValue(row, userIdx), time: Date.parse(rowValue(row, dateIdx)), amount: orderAmountIdx !== undefined ? numeric(row[orderAmountIdx] ?? '') : numeric(row[priceIdx!] ?? '') * numeric(row[amountIdx!] ?? '') })).filter(item => item.user && !Number.isNaN(item.time) && item.amount >= 0)
    if (parsed.length === 0) return []
    const asOf = Math.max(...parsed.map(item => item.time))
    const users = new Map<string, { last: number; frequency: number; monetary: number; orders: Set<string> }>()
    parsed.forEach(item => {
      const current = users.get(item.user) ?? { last: 0, frequency: 0, monetary: 0, orders: new Set<string>() }
      current.last = Math.max(current.last, item.time)
      current.monetary += item.amount
      if (orderIdx !== undefined) current.orders.add(rowValue(item.row, orderIdx))
      else current.frequency += 1
      users.set(item.user, current)
    })
    const profiles = [...users.values()].map(item => ({ recency: Math.max(0, Math.round((asOf - item.last) / 86400000)), frequency: orderIdx !== undefined ? item.orders.size : item.frequency, monetary: item.monetary }))
    const score = (value: number, values: number[], inverse = false) => {
      const min = Math.min(...values), max = Math.max(...values)
      if (min === max) return 3
      const normalized = (value - min) / (max - min)
      return inverse ? 5 - Math.floor(normalized * 4) : 1 + Math.floor(normalized * 4)
    }
    const recencies = profiles.map(item => item.recency), frequencies = profiles.map(item => item.frequency), monetaries = profiles.map(item => item.monetary)
    const groups = new Map<string, { users: number; recency: number; frequency: number; monetary: number }>()
    profiles.forEach(profile => {
      const r = score(profile.recency, recencies, true), f = score(profile.frequency, frequencies), m = score(profile.monetary, monetaries)
      const segment = r >= 4 && f >= 4 && m >= 4 ? '重要价值' : r >= 4 && f >= 3 ? '重要保持' : r >= 4 && m >= 3 ? '重要发展' : r <= 2 && f >= 3 ? '重要挽留' : r >= 4 && f <= 2 ? '新客户' : '一般价值'
      const group = groups.get(segment) ?? { users: 0, recency: 0, frequency: 0, monetary: 0 }
      group.users += 1; group.recency += profile.recency; group.frequency += profile.frequency; group.monetary += profile.monetary; groups.set(segment, group)
    })
    return [...groups.entries()].map(([segment, group]) => ({ segment, users: group.users, share: group.users / profiles.length, avgRecency: group.recency / group.users, avgFrequency: group.frequency / group.users, avgMonetary: group.monetary / group.users })).sort((a, b) => b.users - a.users)
  }

  getFunnelDistribution(filters: MetricFilters = {}): { key: string; label: string; value: number }[] {
    const behavior = tableByRole(this.model, 'behavior')
    if (!behavior || !hasCanonical(behavior, 'behavior')) return []
    const behIdx = colIndex(behavior, 'behavior')!
    const rows = filterRows(behavior.rows, behavior, filters)
    const aliases: Record<string, string[]> = { pv: ['pv', 'view', 'click', '浏览'], fav: ['fav', 'favorite', '收藏'], cart: ['cart', 'add_cart', '加购'], buy: ['buy', 'purchase', 'payment', '购买'] }
    return Object.entries(aliases).map(([key, values]) => ({ key, label: key === 'pv' ? '浏览' : key === 'fav' ? '收藏' : key === 'cart' ? '加购' : '购买', value: rows.filter(row => values.includes(rowValue(row, behIdx).toLowerCase())).length }))
  }

  getDimensionDistribution(filters: MetricFilters = {}): Record<string, { value: string; count: number }[]> {
    const table = tableByRole(this.model, 'behavior') ?? tableByRole(this.model, 'orders') ?? tableByRole(this.model, 'users')
    if (!table) return {}
    const rows = filterRows(table.rows, table, filters)
    const result: Record<string, { value: string; count: number }[]> = {}
    for (const canonical of ['address', 'device', 'province', 'city']) {
      const index = colIndex(table, canonical)
      if (index === undefined) continue
      const counts = new Map<string, number>()
      rows.forEach(row => { const value = rowValue(row, index); if (value) counts.set(value, (counts.get(value) ?? 0) + 1) })
      result[canonical] = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 10)
    }
    return result
  }

  computeAll(filters: MetricFilters = {}): MetricResult[] {
    const keys = Object.keys(metricDefinitions)
    return keys.map(key => this.compute(key, filters))
  }

  getDataDateRange(): { start: string; end: string } | null {
    const dates: string[] = []
    for (const table of this.model.tables) {
      const dateIdx = colIndex(table, 'datetime') ?? colIndex(table, 'created_at')
      if (dateIdx === undefined) continue
      for (const row of table.rows) {
        const value = rowValue(row, dateIdx)
        if (value && !Number.isNaN(Date.parse(value))) dates.push(value.slice(0, 10))
      }
    }
    if (dates.length === 0) return null
    dates.sort()
    return { start: dates[0], end: dates[dates.length - 1] }
  }

  getChannelDistribution(filters: MetricFilters = {}): { name: string; gmv: number; orders: number }[] {
    const behavior = tableByRole(this.model, 'behavior')
    const orders = tableByRole(this.model, 'orders')
    const table = behavior ?? orders
    if (!table || !hasCanonical(table, 'channel')) return []
    const chIdx = colIndex(table, 'channel')!
    const rows = filterRows(table.rows, table, filters)
    const map = new Map<string, { gmv: number; orders: number }>()
    if (behavior && hasCanonical(behavior, 'behavior', 'price', 'amount')) {
      const behIdx = colIndex(behavior, 'behavior')!
      const priceIdx = colIndex(behavior, 'price')!
      const amountIdx = colIndex(behavior, 'amount')!
      for (const row of rows) {
        const ch = rowValue(row, chIdx)
        if (!ch) continue
        const entry = map.get(ch) ?? { gmv: 0, orders: 0 }
        if (rowValue(row, behIdx) === 'buy' || rowValue(row, behIdx) === '购买') {
          entry.gmv += numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? '')
          entry.orders += 1
        }
        map.set(ch, entry)
      }
    } else if (orders && hasCanonical(orders, 'order_amount', 'order_id')) {
      const amountIdx = colIndex(orders, 'order_amount')!
      const oidIdx = colIndex(orders, 'order_id')!
      const seen = new Map<string, Set<string>>()
      for (const row of rows) {
        const ch = rowValue(row, chIdx)
        if (!ch) continue
        if (!seen.has(ch)) seen.set(ch, new Set())
        const oid = rowValue(row, oidIdx!)
        if (seen.get(ch)!.has(oid)) continue
        seen.get(ch)!.add(oid)
        const entry = map.get(ch) ?? { gmv: 0, orders: 0 }
        entry.gmv += numeric(row[amountIdx] ?? '')
        entry.orders += 1
        map.set(ch, entry)
      }
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.gmv - a.gmv)
  }

  getDailyTrend(filters: MetricFilters = {}): { date: string; gmv: number }[] {
    const behavior = tableByRole(this.model, 'behavior')
    const orders = tableByRole(this.model, 'orders')
    const dateCanonical = 'datetime' as const
    const table = behavior ?? orders
    if (!table) return []
    if (!hasCanonical(table, dateCanonical)) {
      const altDate = 'created_at' as const
      if (!hasCanonical(table, altDate)) return []
      return this.buildDailyTrend(table, altDate, filters)
    }
    return this.buildDailyTrend(table, dateCanonical, filters)
  }

  private buildDailyTrend(table: AnalysisTable, dateCanonical: string, filters: MetricFilters): { date: string; gmv: number }[] {
    const dateIdx = colIndex(table, dateCanonical)!
    const rows = filterRows(table.rows, table, filters)
    const dailyMap = new Map<string, number>()
    if (this.model.mode === 'behavior' && hasCanonical(table, 'behavior', 'price', 'amount')) {
      const behIdx = colIndex(table, 'behavior')!
      const priceIdx = colIndex(table, 'price')!
      const amountIdx = colIndex(table, 'amount')!
      for (const row of rows) {
        const date = (rowValue(row, dateIdx) ?? '').slice(0, 10)
        if (!date || (rowValue(row, behIdx) !== 'buy' && rowValue(row, behIdx) !== '购买')) continue
        dailyMap.set(date, (dailyMap.get(date) ?? 0) + numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? ''))
      }
    } else if (hasCanonical(table, 'order_amount')) {
      const amountIdx = colIndex(table, 'order_amount')!
      const oidIdx = colIndex(table, 'order_id')
      const seenPerDay = new Map<string, Set<string>>()
      for (const row of rows) {
        const date = (rowValue(row, dateIdx) ?? '').slice(0, 10)
        if (!date) continue
        if (oidIdx !== undefined) {
          if (!seenPerDay.has(date)) seenPerDay.set(date, new Set())
          const oid = rowValue(row, oidIdx)
          if (seenPerDay.get(date)!.has(oid)) continue
          seenPerDay.get(date)!.add(oid)
        }
        dailyMap.set(date, (dailyMap.get(date) ?? 0) + numeric(row[amountIdx] ?? ''))
      }
    }
    return [...dailyMap.entries()].map(([date, gmv]) => ({ date, gmv })).sort((a, b) => a.date.localeCompare(b.date))
  }

  getProductRanking(filters: MetricFilters = {}): { productId: string; productName: string; salesAmount: number; salesVolume: number }[] {
    const genericRank = this.rankingRows('product_id', filters)
    if (genericRank.length > 0) return this.cached('product-ranking', filters, () => genericRank.map(row => ({ productId: row.rawId, productName: row.displayName, salesAmount: row.salesAmount, salesVolume: row.salesVolume })))
    if (this.model.mode === 'behavior') return []
    const items = tableByRole(this.model, 'order_items')
    const wide = tableByRole(this.model, 'orders')
    const table = items ?? (hasCanonical(wide, 'product_id', 'price', 'amount') ? wide : undefined)
    if (!table || !hasCanonical(table, 'product_id', 'price', 'amount')) return []
    const pidIdx = colIndex(table, 'product_id')!
    const priceIdx = colIndex(table, 'price')!
    const amountIdx = colIndex(table, 'amount')!
    const rows = filterRows(table.rows, table, filters)
    const map = new Map<string, { salesAmount: number; salesVolume: number }>()
    for (const row of rows) {
      const pid = rowValue(row, pidIdx)
      if (!pid) continue
      const entry = map.get(pid) ?? { salesAmount: 0, salesVolume: 0 }
      entry.salesAmount += numeric(row[priceIdx] ?? '') * numeric(row[amountIdx] ?? '')
      entry.salesVolume += numeric(row[amountIdx] ?? '')
      map.set(pid, entry)
    }
    return [...map.entries()].map(([productId, v]) => ({ productId, productName: productId, ...v })).sort((a, b) => b.salesAmount - a.salesAmount).slice(0, 10)
  }

  getBriefText(): string {
    const gmv = this.computeGmv({})
    const orders = this.computeOrders({})
    const refundRate = this.computeRefundAmountRate({})
    const channelDist = this.getChannelDistribution({})
    const topChannel = channelDist[0]
    const parts: string[] = []
    if (gmv.available && orders.available) parts.push(this.model.mode === 'behavior' ? 'GMV ' + gmv.formatted + ', ' + orders.formatted : 'GMV ' + gmv.formatted + ', ' + orders.formatted + ' orders')
    if (topChannel) parts.push(`${topChannel.name}贡献最高成交 ¥${topChannel.gmv.toLocaleString()}`)
    if (refundRate.available) parts.push(`退款率 ${refundRate.formatted}`)
    const recommendations = recommendationsFromMetrics(this.computeAll({}))
    if (recommendations.length > 0) parts.push('建议：' + recommendations[0].title)
    if (parts.length === 0) parts.push(this.model.mode === 'behavior' ? '\u5f53\u524d\u6570\u636e\u6682\u65e0\u53ef\u751f\u6210\u7684\u8d2d\u4e70\u884c\u4e3a\u7b80\u62a5' : '\u5f53\u524d\u6570\u636e\u6682\u65e0\u53ef\u751f\u6210\u7684\u7ecf\u8425\u7b80\u62a5')
    return parts.join('\uFF1B') + '\u3002'
  }
}

export { metricDefinitions }

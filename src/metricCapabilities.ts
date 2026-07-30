import type { DataTable, FileMapping, ImportedFile, MetricCapability, MetricDefinition, TableRelationship } from './importSession'

const canonicalField = (value: string) => value === 'category_id' ? 'category' : value === 'quantity' ? 'amount' : value
const fieldsFor = (mapping: FileMapping | undefined) => new Set((mapping?.fields ?? []).map(field => canonicalField(field.canonical)).filter(Boolean))
const has = (fields: Set<string>, ...names: string[]) => names.some(name => fields.has(name))
const mappingForRole = (mappings: FileMapping[], role: FileMapping['role']) => mappings.find(mapping => mapping.role === role)
 
const behaviorAliases: Record<string, string> = {
  buy: 'buy', purchase: 'buy', payment: 'buy', '\u652f\u4ed8': 'buy', '\u8d2d\u4e70': 'buy',
  pv: 'pv', view: 'pv', click: 'pv', '\u6d4f\u89c8': 'pv',
  fav: 'fav', favorite: 'fav', '\u6536\u85cf': 'fav',
  cart: 'cart', add_cart: 'cart', '\u52a0\u8d2d': 'cart',
}
export type BehaviorValueDistribution = { raw: string; normalized: string; count: number; mapped: boolean }
export type BehaviorSummary = {
  gmv: number | null
  purchasedUnits: number
  purchasingUsers: number
  purchaseBehaviors: number
  funnel: { key: string; label: string; value: number }[]
  behaviorValues: BehaviorValueDistribution[]
  hasGmvFields: boolean
}
const normalizeBehavior = (value: string, confirmedMappings: Record<string, string> = {}) => confirmedMappings[value.trim()] ?? behaviorAliases[value.trim().toLowerCase()] ?? value.trim().toLowerCase()
export const buildBehaviorSummary = (file: ImportedFile, mapping: FileMapping): BehaviorSummary | null => {
  if (mapping.role !== 'behavior' || !file.preview) return null
  const sourceFor = (canonical: string) => mapping.fields.find(field => field.canonical === canonical)?.source
  const behaviorSource = sourceFor('behavior')
  if (!behaviorSource) return null
  const indexes = new Map(file.preview.headers.map((header, index) => [header, index]))
  const value = (row: string[], source: string | undefined) => source === undefined ? '' : row[indexes.get(source) ?? -1] ?? ''
  const funnelCounts = new Map(['pv', 'fav', 'cart', 'buy'].map(key => [key, 0]))
  let gmv = 0
  let purchasedUnits = 0
  const behaviorValues = new Map<string, { raw: string; normalized: string; count: number; mapped: boolean }>()
  let purchaseBehaviors = 0
  const purchasingUsers = new Set<string>()
  ;(file.preview.allRows ?? file.preview.rows).forEach(row => {
    const behavior = normalizeBehavior(value(row, behaviorSource), mapping.behaviorValueMappings)
    if (funnelCounts.has(behavior)) funnelCounts.set(behavior, (funnelCounts.get(behavior) ?? 0) + 1)
    const rawBehavior = value(row, behaviorSource).trim()
    if (rawBehavior) { const current = behaviorValues.get(rawBehavior) ?? { raw: rawBehavior, normalized: behavior, count: 0, mapped: funnelCounts.has(behavior) }; current.count += 1; behaviorValues.set(rawBehavior, current) }
    if (behavior !== 'buy') return
    purchaseBehaviors += 1
    const amount = Number(value(row, sourceFor('amount'))) || 0
    const price = Number(value(row, sourceFor('price')).replace(/[,\u00a5$]/g, '')) || 0
    purchasedUnits += amount
    gmv += price * amount
    const user = value(row, sourceFor('user_id'))
    if (user) purchasingUsers.add(user)
  })
  const hasGmvFields = Boolean(sourceFor('price') && sourceFor('amount'))
  return { gmv: hasGmvFields ? gmv : null, purchasedUnits, purchasingUsers: purchasingUsers.size, purchaseBehaviors, funnel: ['pv', 'fav', 'cart', 'buy'].map(key => ({ key, label: key.toUpperCase(), value: funnelCounts.get(key) ?? 0 })), behaviorValues: [...behaviorValues.values()].sort((a, b) => b.count - a.count), hasGmvFields }
}



export type RelationshipCheck = {
  key: string
  label: string
  matched: number
  total: number
  available: boolean
  message: string
}
export type OrderMultiTableSummary = {
  orderCount: number
  orderGmv: number
  averageOrderValue: number | null
  purchasingUsers: number
  itemCount: number
  refundAmount: number
  refundAmountRate: number | null
  refundOrderCount: number
  refundOrderRate: number | null
  relationships: RelationshipCheck[]
  warning: string | null
}
const rowsFor = (file: ImportedFile | undefined) => file?.preview?.allRows ?? file?.preview?.rows ?? []
const sourceForCanonical = (mapping: FileMapping | undefined, canonical: string) => mapping?.fields.find(field => field.canonical === canonical)?.source

export type ModelValidationIssue = {
  key: string
  fileId: string
  fileName: string
  severity: 'error' | 'warning'
  label: string
  detail: string
  missingFields?: string[]
}

export type ModelValidation = {
  issues: ModelValidationIssue[]
  errorCount: number
  warningCount: number
}

const mappedCanonicalFields = (mapping: FileMapping | undefined) => new Set((mapping?.fields ?? []).map(field => field.canonical).filter(Boolean))
const nonEmptyValues = (file: ImportedFile | undefined, mapping: FileMapping | undefined, canonical: string) => {
  const source = sourceForCanonical(mapping, canonical)
  if (!file?.preview || !source) return []
  const index = file.preview.headers.indexOf(source)
  return rowsFor(file).map(row => (index >= 0 ? row[index] ?? '' : '').trim()).filter(Boolean)
}
const missingCanonicalFields = (mapping: FileMapping | undefined, required: string[]) => {
  const fields = mappedCanonicalFields(mapping)
  return required.filter(field => !fields.has(field))
}

export const buildModelValidation = (files: ImportedFile[], mappings: FileMapping[]): ModelValidation => {
  const issues: ModelValidationIssue[] = []
  const fileFor = (mapping: FileMapping) => files.find(file => file.id === mapping.fileId)
  const addMissing = (mapping: FileMapping, required: string[], label: string, detail: string) => {
    const missingFields = missingCanonicalFields(mapping, required)
    if (!missingFields.length) return
    const file = fileFor(mapping)
    issues.push({ key: mapping.role + '-required-fields', fileId: mapping.fileId, fileName: file?.name ?? mapping.fileId, severity: 'error', label, detail: (file?.name ?? mapping.fileId) + '：' + detail + '（缺少 ' + missingFields.join('、') + '）', missingFields })
  }
  mappings.forEach(mapping => {
    if (mapping.role === 'behavior') addMissing(mapping, ['behavior'], '行为表关键字段不足', '用户行为表至少需要 behavior')
    if (mapping.role === 'orders') addMissing(mapping, ['order_id', 'order_amount'], '订单主表关键字段不足', '订单主表至少需要 order_id 和 order_amount')
    if (mapping.role === 'order_items') addMissing(mapping, ['order_id', 'product_id'], '订单明细关键字段不足', '订单明细至少需要 order_id 和 product_id')
    if (mapping.role === 'products') addMissing(mapping, ['product_id'], '商品表关键字段不足', '商品表至少需要 product_id')
    if (mapping.role === 'users') addMissing(mapping, ['user_id'], '用户表关键字段不足', '用户表至少需要 user_id')
    if (mapping.role === 'refunds') addMissing(mapping, ['refund_amount'], '退款表关键字段不足', '计算退款率至少需要 refund_amount；退款率分母来自订单主表 order_amount')
  })
  const refundMappings = mappings.filter(mapping => mapping.role === 'refunds' && !missingCanonicalFields(mapping, ['refund_amount']).length)
  const hasOrderDenominator = mappings.some(mapping => mapping.role === 'orders' && !missingCanonicalFields(mapping, ['order_amount']).length)
  if (refundMappings.length && !hasOrderDenominator) {
    refundMappings.forEach(mapping => {
      const file = fileFor(mapping)
      issues.push({ key: 'refund-missing-denominator', fileId: mapping.fileId, fileName: file?.name ?? mapping.fileId, severity: 'error', label: '退款率分母不足', detail: (file?.name ?? mapping.fileId) + '：退款率需要订单主表的 order_amount 作为 GMV 分母' })
    })
  }
  mappings.forEach(mapping => {
    if (mapping.role !== 'products' && mapping.role !== 'users') return
    const file = fileFor(mapping)
    const canonical = mapping.role === 'products' ? 'product_id' : 'user_id'
    const values = nonEmptyValues(file, mapping, canonical)
    const rowCount = rowsFor(file).length
    if (rowCount > 0 && values.length < rowCount) {
      issues.push({ key: mapping.role + '-blank-key', fileId: mapping.fileId, fileName: file?.name ?? mapping.fileId, severity: 'error', label: mapping.role === 'products' ? '商品表标识存在空值' : '用户表标识存在空值', detail: (file?.name ?? mapping.fileId) + '：' + canonical + ' 存在空值，请补齐唯一标识后再确认' })
    }
    if (!values.length) return
    const duplicates = values.length - new Set(values).size
    if (duplicates > 0) {
      issues.push({
        key: mapping.role + '-duplicate-key',
        fileId: mapping.fileId,
        fileName: file?.name ?? mapping.fileId,
        severity: 'error',
        label: mapping.role === 'products' ? '商品表标识不唯一' : '用户表标识不唯一',
        detail: (file?.name ?? mapping.fileId) + '：' + canonical + ' 存在 ' + duplicates + ' 个重复值，请保留唯一标识后再确认',
      })
    }
  })
  const errorCount = issues.filter(issue => issue.severity === 'error').length
  return { issues, errorCount, warningCount: issues.length - errorCount }
}
const columnValues = (file: ImportedFile | undefined, mapping: FileMapping | undefined, canonical: string) => {
  const source = sourceForCanonical(mapping, canonical)
  if (!file?.preview || !source) return []
  const index = file.preview.headers.indexOf(source)
  return rowsFor(file).map(row => (index >= 0 ? row[index] ?? '' : '').trim()).filter(Boolean)
}
const relationCheck = (key: string, label: string, left: string[], right: string[]): RelationshipCheck => {
  const rightSet = new Set(right)
  const uniqueLeft = [...new Set(left)]
  const matched = uniqueLeft.filter(value => rightSet.has(value)).length
  const total = uniqueLeft.length
  return { key, label, matched, total, available: total > 0 && matched === total, message: total === 0 ? '\u7f3a\u5c11\u5173\u8054\u952e\u503c' : matched === total ? '\u5168\u90e8\u5173\u8054\u952e\u5df2\u5339\u914d' : '\u5df2\u5339\u914d ' + matched + '/' + total + ' \u4e2a\u5173\u8054\u952e' }
}
export const buildOrderMultiTableSummary = (files: ImportedFile[], mappings: FileMapping[]): OrderMultiTableSummary | null => {
  const orders = mappingForRole(mappings, 'orders')
  const items = mappingForRole(mappings, 'order_items')
  const products = mappingForRole(mappings, 'products')
  const users = mappingForRole(mappings, 'users')
  const refunds = mappingForRole(mappings, 'refunds')
  if (!orders && !items) return null
  const fileFor = (mapping: FileMapping | undefined) => files.find(file => file.id === mapping?.fileId)
  const orderFile = fileFor(orders)
  const itemFile = fileFor(items)
  const productFile = fileFor(products)
  const userFile = fileFor(users)
  const refundFile = fileFor(refunds)
  const orderIds = columnValues(orderFile, orders, 'order_id')
  const itemOrderIds = columnValues(itemFile, items, 'order_id')
  const userIds = columnValues(orderFile, orders, 'user_id')
  const uniquePurchasingUsers = new Set(userIds)
  const knownUserIds = columnValues(userFile, users, 'user_id')
  const itemProductIds = columnValues(itemFile, items, 'product_id')
  const knownProductIds = columnValues(productFile, products, 'product_id')
  const refundOrderIds = columnValues(refundFile, refunds, 'order_id')
  const relationships = [
    relationCheck('orders-items', 'orders -> order_items', orderIds, itemOrderIds),
    relationCheck('orders-users', 'orders -> users', userIds, knownUserIds),
    relationCheck('items-products', 'order_items -> products', itemProductIds, knownProductIds),
    relationCheck('refunds-orders', 'refunds -> orders', refundOrderIds, orderIds),
  ].filter(check => check.total > 0 || ['orders-items', 'orders-users', 'items-products', 'refunds-orders'].includes(check.key))
  const amountSource = sourceForCanonical(orders, 'order_amount')
  const amountIndex = orderFile?.preview?.headers.indexOf(amountSource ?? '') ?? -1
  const amountsByOrder = new Map<string, number>()
  rowsFor(orderFile).forEach(row => {
    const orderIdSource = sourceForCanonical(orders, 'order_id')
    const orderIdIndex = orderFile?.preview?.headers.indexOf(orderIdSource ?? '') ?? -1
    const id = amountIndex >= 0 && orderIdIndex >= 0 ? (row[orderIdIndex] ?? '').trim() : ''
    if (!id || amountsByOrder.has(id)) return
    const amount = Number((row[amountIndex] ?? '').replace(/[,\u00a5$]/g, '')) || 0
    amountsByOrder.set(id, amount)
  })
  const refundAmountSource = sourceForCanonical(refunds, 'refund_amount')
  const refundAmountIndex = refundFile?.preview?.headers.indexOf(refundAmountSource ?? '') ?? -1
  const refundAmount = rowsFor(refundFile).reduce((sum, row) => sum + (Number((row[refundAmountIndex] ?? '').replace(/[,\u00a5$]/g, '')) || 0), 0)
  const orderGmv = [...amountsByOrder.values()].reduce((sum, amount) => sum + amount, 0)
  const refundOrderIdSource = sourceForCanonical(refunds, 'order_id')
  const uniqueRefundOrderIds = new Set(refundOrderIds.filter(Boolean))
  const refundAmountRate = refundAmountSource && amountSource && orderGmv > 0 ? refundAmount / orderGmv * 100 : null
  const refundOrderRate = refundOrderIdSource && amountsByOrder.size > 0 ? uniqueRefundOrderIds.size / amountsByOrder.size * 100 : null
  const averageOrderValue = amountsByOrder.size > 0 ? orderGmv / amountsByOrder.size : null
  const hasDuplicateOrderIds = orderIds.length > new Set(orderIds).size
  const warning = hasDuplicateOrderIds ? '\u68c0\u6d4b\u5230\u91cd\u590d order_id\uff0cGMV \u6bcf\u4e2a\u8ba2\u5355\u53ea\u53d6\u4e00\u6b21\u91d1\u989d' : relationships.some(check => !check.available && check.total > 0) ? '\u90e8\u5206\u8868\u5173\u8054\u952e\u672a\u5339\u914d\uff0c\u76f8\u5173\u6307\u6807\u53ef\u80fd\u4e0d\u5b8c\u6574' : null
  return { orderCount: amountsByOrder.size, orderGmv, averageOrderValue, purchasingUsers: uniquePurchasingUsers.size, itemCount: rowsFor(itemFile).length, refundAmount, refundAmountRate, refundOrderCount: uniqueRefundOrderIds.size, refundOrderRate, relationships, warning }
}

export type OrderItemsSummary = {
  detailSales: number
  orderCount: number | null
  productSalesVolume: number
  productSalesAmount: number
  productRank: { productId: string; salesVolume: number; salesAmount: number }[]
  purchasingUsers: number | null
  hasOrderId: boolean
  hasUserId: boolean
  totalRows: number
  orderDateRange: { start: string; end: string } | null
}

export const buildOrderItemsSummary = (files: ImportedFile[], mappings: FileMapping[]): OrderItemsSummary | null => {
  const items = mappingForRole(mappings, 'order_items')
  if (!items) return null
  const file = files.find(f => f.id === items.fileId)
  if (!file?.preview) return null
  const rows = rowsFor(file)
  const sourceFor = (canonical: string) => sourceForCanonical(items, canonical)
  const headers = file.preview.headers
  const valueAt = (row: string[], source: string | undefined) => source !== undefined ? (row[headers.indexOf(source)] ?? '').trim() : ''
  const priceSource = sourceFor('price')
  const amountSource = sourceFor('amount')
  const orderIdSource = sourceFor('order_id')
  const productIdSource = sourceFor('product_id')
  const userIdSource = sourceFor('user_id')
  const dateSource = sourceFor('datetime') || sourceFor('created_at')
  const hasOrderId = Boolean(orderIdSource)
  const hasUserId = Boolean(userIdSource)
  const priceIndex = priceSource ? headers.indexOf(priceSource) : -1
  const amountIndex = amountSource ? headers.indexOf(amountSource) : -1
  const orderIdIndex = orderIdSource ? headers.indexOf(orderIdSource) : -1
  const productIdIndex = productIdSource ? headers.indexOf(productIdSource) : -1
  const userIdIndex = userIdSource ? headers.indexOf(userIdSource) : -1
  const dateIndex = dateSource ? headers.indexOf(dateSource) : -1
  let detailSales = 0
  let productSalesVolume = 0
  const orderIds = new Set<string>()
  const purchasingUsers = new Set<string>()
  const productData = new Map<string, { volume: number; amount: number }>()
  let timestamps: number[] = []
  rows.forEach(row => {
    const amount = amountIndex >= 0 ? Number(valueAt(row, amountSource).replace(/[,\u00a5$]/g, '')) || 0 : 0
    const price = priceIndex >= 0 ? Number(valueAt(row, priceSource).replace(/[,\u00a5$]/g, '')) || 0 : 0
    const salesAmount = price * amount
    detailSales += salesAmount
    productSalesVolume += amount
    if (orderIdIndex >= 0) {
      const oid = valueAt(row, orderIdSource)
      if (oid) orderIds.add(oid)
    }
    if (productIdIndex >= 0) {
      const pid = valueAt(row, productIdSource)
      if (pid) {
        const existing = productData.get(pid) ?? { volume: 0, amount: 0 }
        existing.volume += amount
        existing.amount += salesAmount
        productData.set(pid, existing)
      }
    }
    if (userIdIndex >= 0) {
      const uid = valueAt(row, userIdSource)
      if (uid) purchasingUsers.add(uid)
    }
    if (dateIndex >= 0) {
      const raw = valueAt(row, dateSource)
      const ts = Date.parse(raw)
      if (!Number.isNaN(ts)) timestamps.push(ts)
    }
  })
  const productRank = [...productData.entries()]
    .map(([productId, data]) => ({ productId, salesVolume: data.volume, salesAmount: data.amount }))
    .sort((a, b) => b.salesAmount - a.salesAmount)
    .slice(0, 50)
  const orderDateRange = timestamps.length >= 2
    ? { start: new Date(Math.min(...timestamps)).toISOString().slice(0, 10), end: new Date(Math.max(...timestamps)).toISOString().slice(0, 10) }
    : timestamps.length === 1
    ? { start: new Date(timestamps[0]).toISOString().slice(0, 10), end: new Date(timestamps[0]).toISOString().slice(0, 10) }
    : null
  return {
    detailSales,
    orderCount: hasOrderId ? orderIds.size : null,
    productSalesVolume,
    productSalesAmount: detailSales,
    productRank,
    purchasingUsers: hasUserId ? purchasingUsers.size : null,
    hasOrderId,
    hasUserId,
    totalRows: rows.length,
    orderDateRange,
  }
}

export type OrderWideSummary = {
  orderCount: number
  orderGmv: number
  averageOrderValue: number | null
  detailSales: number
  productSalesVolume: number
  productSalesAmount: number
  productRank: { productId: string; salesVolume: number; salesAmount: number }[]
  purchasingUsers: number | null
  totalRows: number
  hasUserId: boolean
  hasAmountConflict: boolean
  amountConflictDetail: string | null
  warning: string | null
  error: string | null
}

export const buildOrderWideSummary = (files: ImportedFile[], mappings: FileMapping[]): OrderWideSummary | null => {
  const wideMappings = mappings.filter(m => m.singleTableType === 'order_wide')
  if (wideMappings.length === 0) return null
  const mapping = wideMappings[0]
  const file = files.find(f => f.id === mapping.fileId)
  if (!file?.preview) return null
  const rows = rowsFor(file)
  const sourceFor = (canonical: string) => sourceForCanonical(mapping, canonical)
  const headers = file.preview.headers
  const valueAt = (row: string[], source: string | undefined) => source !== undefined ? (row[headers.indexOf(source)] ?? '').trim() : ''
  const orderIdSource = sourceFor('order_id')
  const orderAmountSource = sourceFor('order_amount')
  const priceSource = sourceFor('price')
  const amountSource = sourceFor('amount')
  const productIdSource = sourceFor('product_id')
  const userIdSource = sourceFor('user_id')
  const hasUserId = Boolean(userIdSource)
  const orderIdIndex = orderIdSource ? headers.indexOf(orderIdSource) : -1
  const orderAmountIndex = orderAmountSource ? headers.indexOf(orderAmountSource) : -1
  const priceIndex = priceSource ? headers.indexOf(priceSource) : -1
  const amountIndex = amountSource ? headers.indexOf(amountSource) : -1
  const productIdIndex = productIdSource ? headers.indexOf(productIdSource) : -1
  const userIdIndex = userIdSource ? headers.indexOf(userIdSource) : -1
  if (orderIdIndex < 0) return null
  const amountsByOrder = new Map<string, number>()
  let hasAmountConflict = false
  let amountConflictDetail: string | null = null
  const purchasingUsers = new Set<string>()
  const productData = new Map<string, { volume: number; amount: number }>()
  let detailSales = 0
  let productSalesVolume = 0
  rows.forEach(row => {
    const oid = valueAt(row, orderIdSource)
    if (!oid) return
    if (orderAmountIndex >= 0) {
      const rawAmount = Number(valueAt(row, orderAmountSource).replace(/[,\u00a5$]/g, '')) || 0
      if (amountsByOrder.has(oid)) {
        if (amountsByOrder.get(oid) !== rawAmount && !hasAmountConflict) {
          hasAmountConflict = true
          amountConflictDetail = `订单 ${oid} 存在不同 order_amount（${amountsByOrder.get(oid)} ≠ ${rawAmount}）`
        }
      } else {
        amountsByOrder.set(oid, rawAmount)
      }
    }
    if (productIdIndex >= 0 && priceIndex >= 0 && amountIndex >= 0) {
      const pid = valueAt(row, productIdSource)
      const amount = Number(valueAt(row, amountSource).replace(/[,\u00a5$]/g, '')) || 0
      const price = Number(valueAt(row, priceSource).replace(/[,\u00a5$]/g, '')) || 0
      const salesAmount = price * amount
      detailSales += salesAmount
      productSalesVolume += amount
      if (pid) {
        const existing = productData.get(pid) ?? { volume: 0, amount: 0 }
        existing.volume += amount
        existing.amount += salesAmount
        productData.set(pid, existing)
      }
    }
    if (userIdIndex >= 0) {
      const uid = valueAt(row, userIdSource)
      if (uid) purchasingUsers.add(uid)
    }
  })
  const orderGmv = [...amountsByOrder.values()].reduce((sum, a) => sum + a, 0)
  const orderCount = amountsByOrder.size
  const productRank = [...productData.entries()]
    .map(([productId, data]) => ({ productId, salesVolume: data.volume, salesAmount: data.amount }))
    .sort((a, b) => b.salesAmount - a.salesAmount)
    .slice(0, 50)
  const hasDuplicateOrderIds = new Set(rows.map(row => orderIdIndex >= 0 ? valueAt(row, orderIdSource) : '').filter(Boolean)).size < rows.filter(row => orderIdIndex >= 0 && valueAt(row, orderIdSource)).length
  const error = hasAmountConflict ? amountConflictDetail : null
  const warning = hasAmountConflict ? null : hasDuplicateOrderIds ? '检测到重复 order_id，GMV 每个订单只取一次金额' : null
  return {
    orderCount,
    orderGmv,
    averageOrderValue: orderCount > 0 ? orderGmv / orderCount : null,
    detailSales,
    productSalesVolume,
    productSalesAmount: detailSales,
    productRank,
    purchasingUsers: hasUserId ? purchasingUsers.size : null,
    totalRows: rows.length,
    hasUserId,
    hasAmountConflict,
    amountConflictDetail,
    warning,
    error,
  }
}

export type QualityIssue = { severity: 'error' | 'warning'; label: string; detail: string; count?: number }
export type DataQualitySummary = { issues: QualityIssue[]; errorCount: number; warningCount: number; totalRows: number; timeRanges: { fileName: string; start: string; end: string }[] }
export type DataQualityReport = DataQualitySummary & { generatedAt: string; affectedMetrics: string[] }
const mappedSource = (mapping: FileMapping | undefined, names: string[]) => names.map(name => sourceForCanonical(mapping, name)).find(Boolean)
const parseDateValue = (value: string) => { const parsed = Date.parse(value); return value && Number.isNaN(parsed) ? null : parsed }
export const buildDataQualitySummary = (files: ImportedFile[], mappings: FileMapping[]): DataQualitySummary => {
  const issues: QualityIssue[] = []; const timeRanges: DataQualitySummary['timeRanges'] = []; let totalRows = 0
  files.forEach(file => {
    const mapping = mappings.find(item => item.fileId === file.id); const rows = rowsFor(file); totalRows += rows.length; const headers = file.preview?.headers ?? []
    const valueAt = (row: string[], source: string | undefined) => source ? row[headers.indexOf(source)] ?? '' : ''
    const mappedFields = mapping?.fields.filter(field => field.canonical && field.source) ?? []
    mappedFields.forEach(field => { const blankCount = rows.filter(row => !valueAt(row, field.source).trim()).length; if (blankCount) issues.push({ severity: 'warning', label: '\u5fc5\u8981\u5b57\u6bb5\u5b58\u5728\u7a7a\u503c', detail: file.name + ' / ' + field.canonical + '\uff1a' + blankCount + ' \u884c\u4e3a\u7a7a', count: blankCount }) })
    const seen = new Set<string>(); let duplicateCount = 0; rows.forEach(row => { const key = JSON.stringify(row); if (seen.has(key)) duplicateCount += 1; else seen.add(key) });
    if (duplicateCount) issues.push({ severity: 'warning', label: '\u5b58\u5728\u91cd\u590d\u884c', detail: file.name + '\uff1a' + duplicateCount + ' \u884c\u5b8c\u5168\u91cd\u590d', count: duplicateCount })
    const dateSource = mappedSource(mapping, ['datetime', 'created_at', 'refund_at']); let badDates = 0; const timestamps: number[] = []
    rows.forEach(row => { const raw = valueAt(row, dateSource); if (!raw) return; const timestamp = parseDateValue(raw); if (timestamp === null) badDates += 1; else timestamps.push(timestamp) })
    if (badDates) issues.push({ severity: 'warning', label: '\u65e5\u671f\u65e0\u6cd5\u89e3\u6790', detail: file.name + '\uff1a' + badDates + ' \u4e2a\u65e5\u671f\u503c\u65e0\u6cd5\u89e3\u6790', count: badDates })
    if (timestamps.length) timeRanges.push({ fileName: file.name, start: new Date(Math.min(...timestamps)).toISOString().slice(0, 10), end: new Date(Math.max(...timestamps)).toISOString().slice(0, 10) })
    const amountSource = mappedSource(mapping, ['order_amount', 'price', 'amount', 'refund_amount']); let badAmounts = 0
    rows.forEach(row => { const raw = valueAt(row, amountSource).replace(/[,¥$]/g, '').trim(); if (!raw) return; const amount = Number(raw); if (!Number.isFinite(amount) || amount < 0) badAmounts += 1 })
    if (badAmounts) issues.push({ severity: 'warning', label: '\u91d1\u989d\u6216\u6570\u91cf\u5f02\u5e38', detail: file.name + '\uff1a' + badAmounts + ' \u4e2a\u8d1f\u6570\u6216\u65e0\u6cd5\u8bc6\u522b\u7684\u6570\u503c', count: badAmounts })
    if (mapping?.role === 'orders' && (!sourceForCanonical(mapping, 'order_id') || !sourceForCanonical(mapping, 'order_amount'))) issues.push({ severity: 'error', label: '\u8ba2\u5355\u4e3b\u8868\u5b57\u6bb5\u4e0d\u8db3', detail: file.name + '\uff1a\u7f3a\u5c11 order_id \u6216 order_amount' })
    if (mapping?.role === 'order_items' && (!sourceForCanonical(mapping, 'order_id') || !sourceForCanonical(mapping, 'product_id'))) issues.push({ severity: 'error', label: '\u8ba2\u5355\u660e\u7ec6\u5b57\u6bb5\u4e0d\u8db3', detail: file.name + '\uff1a\u7f3a\u5c11 order_id \u6216 product_id' })
  })
  const ranges = timeRanges.map(range => [Date.parse(range.start), Date.parse(range.end)] as const); if (ranges.length > 1) { const latestStart = Math.max(...ranges.map(range => range[0])); const earliestEnd = Math.min(...ranges.map(range => range[1])); if (latestStart > earliestEnd) issues.push({ severity: 'warning', label: '\u6587\u4ef6\u65f6\u95f4\u8303\u56f4\u4e0d\u4e00\u81f4', detail: '\u4e0a\u4f20\u6587\u4ef6\u7684\u65f6\u95f4\u8303\u56f4\u6ca1\u6709\u91cd\u53e0' }) }
  const errorCount = issues.filter(issue => issue.severity === 'error').length; return { issues, errorCount, warningCount: issues.length - errorCount, totalRows, timeRanges }
}

export const buildDataQualityReport = (files: ImportedFile[], mappings: FileMapping[]): DataQualityReport => {
  const summary = buildDataQualitySummary(files, mappings)
  const affectedMetrics = new Set<string>()
  summary.issues.forEach(issue => {
    if (issue.label.includes('订单')) affectedMetrics.add('orders')
    if (issue.label.includes('金额') || issue.label.includes('数量')) affectedMetrics.add('gmv')
    if (issue.label.includes('日期')) affectedMetrics.add('trend')
    if (issue.label.includes('关联')) affectedMetrics.add('cross-table analysis')
  })
  return { ...summary, generatedAt: new Date().toISOString(), affectedMetrics: [...affectedMetrics] }
}

const metricDefinitions: Record<string, MetricDefinition> = {
  gmv: { source: '订单主表或用户行为表', granularity: '订单 / 购买行为', formula: '订单主表：按订单汇总 order_amount；行为表：仅 behavior=buy，price × amount；订单明细单表不使用此指标，请使用明细销售额', dedupKey: '订单主表使用 order_id；行为表不做订单去重' },
  orders: { source: '订单主表、订单明细单表或用户行为表', granularity: '订单 / 行为记录', formula: '订单主表或明细：order_id 去重计数；无 order_id 时统计购买行为行数或明细行数', dedupKey: 'order_id；无 order_id 时不代表真实订单量' },
  buyers: { source: '用户行为表、订单主表或订单明细单表', granularity: '用户', formula: '统计发生购买行为或订单的去重 user_id', dedupKey: 'user_id' },
  product_rank: { source: '订单商品明细', granularity: '订单商品', formula: '按 product_id 汇总数量和销售额（price × amount）', dedupKey: '订单商品行；不使用订单主表 GMV' },
  category_rank: { source: '订单商品明细', granularity: '类目', formula: '按 category 汇总数量和销售额（price × amount）', dedupKey: '订单商品行；不使用订单主表 GMV' },
  channel: { source: '用户行为表或订单主表', granularity: '渠道 × 订单 / 行为', formula: '按 channel 分组汇总对应订单或行为金额', dedupKey: '订单模式使用 order_id；行为模式使用行为记录' },
  refund_rate: { source: '退款表 + 订单主表', granularity: '退款记录 / 订单', formula: '退款金额 ÷ 订单 GMV × 100%（金额退款率）', dedupKey: '退款金额按 refund_amount 逐行汇总不合并；订单 GMV 按 order_id 去重' },
  refund_order_rate: { source: '退款表 + 订单主表', granularity: '退款订单 / 全部订单', formula: '去重退款订单数 ÷ 去重支付订单数 × 100%（订单退款率）', dedupKey: '退款订单按 order_id 去重；支付订单按 order_id 去重' },
  average_order_value: { source: '订单主表', granularity: '订单', formula: '订单 GMV ÷ 去重订单量', dedupKey: 'order_id' },
  repeat_rate: { source: '用户行为表或订单主表', granularity: '用户 × 时间', formula: '按时间排序后，发生多次购买的用户数 ÷ 购买用户数', dedupKey: 'user_id + 时间字段' },
  funnel: { source: '用户行为表', granularity: '行为记录', formula: '按 behavior 值统计 pv、fav、cart、buy 分布', dedupKey: '行为记录，不去重' },
  user_dimensions: { source: '用户行为表、订单主表或用户表', granularity: '用户属性', formula: '按 address、device、province、city 等维度统计记录分布', dedupKey: '属性记录；没有 user_id 时不代表去重用户数' },
  rfm: { source: '用户行为表、订单主表或订单明细', granularity: '用户', formula: '按最近购买时间、购买频次和累计金额给用户评分并分层', dedupKey: 'user_id' },
  detail_sales: { source: '订单商品明细', granularity: '订单商品', formula: '按明细行汇总 price × amount，不按订单去重', dedupKey: '订单商品行；不等于订单主表 GMV' },
}

export const buildMetricCapabilities = (files: ImportedFile[], mappings: FileMapping[]): MetricCapability[] => {
  const behavior = mappingForRole(mappings, 'behavior')
  const orders = mappingForRole(mappings, 'orders')
  const items = mappingForRole(mappings, 'order_items')
  const refunds = mappingForRole(mappings, 'refunds')
  const behaviorFields = fieldsFor(behavior)
  const orderFields = fieldsFor(orders)
  const itemFields = fieldsFor(items)
  const refundFields = fieldsFor(refunds)
  const behaviorMode = Boolean(behavior)
  const orderMode = Boolean(orders || items)
  const hasBuyUsers = behaviorMode ? has(behaviorFields, 'user_id') && has(behaviorFields, 'behavior') : has(orderFields, 'user_id')
  const hasTime = behaviorMode ? has(behaviorFields, 'datetime', 'created_at') : has(orderFields, 'datetime', 'created_at')
  const hasRfmBehavior = has(behaviorFields, 'user_id') && has(behaviorFields, 'datetime', 'created_at') && has(behaviorFields, 'behavior') && has(behaviorFields, 'price') && has(behaviorFields, 'amount')
  const hasRfmOrders = has(orderFields, 'user_id') && has(orderFields, 'datetime', 'created_at') && (has(orderFields, 'order_amount') || (has(orderFields, 'price') && has(orderFields, 'amount')))
  const hasRfmItems = has(itemFields, 'user_id') && has(itemFields, 'datetime', 'created_at') && has(itemFields, 'price') && has(itemFields, 'amount')
  const hasChannel = behaviorMode ? has(behaviorFields, 'channel') : has(orderFields, 'channel')
  const hasAmount = behaviorMode ? has(behaviorFields, 'behavior', 'price', 'amount') : has(orderFields, 'order_amount')
  const hasProduct = Boolean(items) && has(itemFields, 'product_id') && has(itemFields, 'amount', 'price')
  const hasCategory = has(behaviorFields, 'category') || has(itemFields, 'category') || has(orderFields, 'category')
  const hasRefundAmount = Boolean(refunds && has(refundFields, 'refund_amount'))
  const hasRefundDenominator = Boolean(orders && has(orderFields, 'order_amount'))
  const hasRefund = hasRefundAmount && hasRefundDenominator
  const hasRefundOrderId = Boolean(refunds && has(refundFields, 'order_id'))
  const hasRefundOrder = hasRefundOrderId && Boolean(orders && has(orderFields, 'order_id'))
  const hasDetailSales = Boolean(items) && has(itemFields, 'price') && has(itemFields, 'amount')
  const orderItemsMode = Boolean(items) && !Boolean(orders)
  return [
    { key: 'gmv', label: 'GMV', available: hasAmount && (behaviorMode || (orderMode && !orderItemsMode)), reason: hasAmount ? (orderItemsMode ? '仅订单明细表时，明细销售额不等于订单实付 GMV，请查看明细销售额' : undefined) : '暂无 GMV：缺少成交金额字段', requiredFields: behaviorMode ? ['behavior', 'price', 'amount'] : ['order_amount'] },
    { key: 'orders', label: behaviorMode && !has(behaviorFields, 'order_id') ? '购买行为数' : orderItemsMode && !has(itemFields, 'order_id') ? '明细行数' : '订单量', available: behaviorMode ? has(behaviorFields, 'behavior') : orderItemsMode ? has(itemFields, 'order_id') : has(orderFields, 'order_id'), reason: behaviorMode && !has(behaviorFields, 'order_id') ? '无 order_id，将按购买行为行数展示，不能代表真实订单量' : orderItemsMode && !has(itemFields, 'order_id') ? '暂无订单量：缺少 order_id，将按明细行数展示' : !has(orderFields, 'order_id') ? '暂无真实订单量：缺少 order_id' : undefined, requiredFields: behaviorMode ? ['behavior'] : ['order_id'] },
    { key: 'buyers', label: '购买用户数', available: behaviorMode ? hasBuyUsers : orderItemsMode ? has(itemFields, 'user_id') : hasBuyUsers, reason: orderItemsMode && !has(itemFields, 'user_id') ? '暂无购买用户数：缺少 user_id' : '暂无购买用户数：缺少 user_id', requiredFields: ['user_id'] },
    { key: 'average_order_value', label: behaviorMode ? '平均购买行为金额' : '客单价', available: behaviorMode ? has(behaviorFields, 'behavior', 'price', 'amount') : orderMode && !orderItemsMode && has(orders ? orderFields : new Set<string>(), 'order_id', 'order_amount'), reason: behaviorMode ? '暂无平均购买行为金额：缺少 behavior、price 或 amount' : '暂无客单价：缺少订单主表 order_id 或 order_amount', requiredFields: behaviorMode ? ['behavior', 'price', 'amount'] : ['order_id', 'order_amount'] },
    { key: 'product_rank', label: '商品排行', available: hasProduct, reason: '暂无商品排行：缺少商品明细中的商品标识、数量或金额', requiredFields: ['product_id', 'amount/price'] },
    { key: 'category_rank', label: '类目排行', available: hasCategory, reason: behaviorMode ? '暂无类目排行：行为表缺少 category_id' : '暂无类目排行：缺少订单商品明细中的 category_id', requiredFields: ['category_id'] },
    { key: 'detail_sales', label: '明细销售额', available: hasDetailSales, reason: !items ? '暂无明细销售额：需要订单商品明细角色，并映射 price 和 amount' : '暂无明细销售额：订单商品明细缺少 price 或 amount', requiredFields: ['price', 'amount'] },
    { key: 'channel', label: '渠道贡献', available: hasChannel, reason: '暂无渠道贡献：缺少 channel', requiredFields: ['channel'] },
    { key: 'refund_rate', label: '金额退款率', available: hasRefund, reason: !hasRefundAmount ? '暂无金额退款率：缺少退款金额字段' : !hasRefundDenominator ? '暂无金额退款率：缺少订单金额分母' : undefined, requiredFields: ['refund_amount', 'order_amount'] },
    { key: 'refund_order_rate', label: '订单退款率', available: hasRefundOrder, reason: !hasRefundOrderId ? '暂无订单退款率：缺少退款表 order_id' : !has(orderFields, 'order_id') ? '暂无订单退款率：缺少订单主表 order_id' : undefined, requiredFields: ['refund.order_id', 'orders.order_id'] },
    { key: 'repeat_rate', label: '复购率', available: (orderItemsMode ? has(itemFields, 'user_id') : hasBuyUsers) && (orderItemsMode ? has(itemFields, 'datetime', 'created_at') : hasTime), reason: orderItemsMode && !has(itemFields, 'user_id') ? '暂无复购率：缺少 user_id' : !(orderItemsMode ? has(itemFields, 'datetime', 'created_at') : hasTime) ? '暂无复购率：缺少可排序时间字段' : '暂无复购率：缺少 user_id', requiredFields: ['user_id', 'datetime/created_at'] },
    { key: 'funnel', label: '行为漏斗', available: behaviorMode && has(behaviorFields, 'behavior'), reason: '暂无行为漏斗：缺少 behavior', requiredFields: ['behavior'] },
    { key: 'user_dimensions', label: '用户属性分布', available: (behaviorMode ? has(behaviorFields, 'address', 'device', 'province', 'city') : has(orderFields, 'address', 'device', 'province', 'city')), reason: '暂无用户属性分布：缺少 address、device、province 或 city', requiredFields: ['address/device/province/city'] },
    { key: 'rfm', label: 'RFM 用户分层', available: hasRfmBehavior || hasRfmOrders || hasRfmItems, reason: '暂无 RFM 分层：需要 user_id、时间和可计算金额字段', requiredFields: ['user_id', 'datetime/created_at', 'order_amount 或 price+amount'] },
  ].map(capability => ({ ...capability, definition: metricDefinitions[capability.key], available: capability.available && files.length > 0 }))
}

export const buildGenericMetricCapabilities = (
  tables: DataTable[],
  relationships: TableRelationship[],
  legacyCapabilities: MetricCapability[],
): MetricCapability[] => {
  const confirmed = relationships.filter(relationship => relationship.status === 'confirmed')
  const semanticsFor = (table: DataTable) => new Set(table.columns.map(column => column.semanticType).filter((value): value is string => Boolean(value)))
  const hasRankingSource = (identifiers: string[]) => tables.some(table => {
    const semantics = semanticsFor(table)
    return identifiers.some(identifier => semantics.has(identifier)) && table.rowCount > 0
  })
  const hasDisplayRelationship = (identifiers: string[]) => confirmed.some(relationship => {
    const table = tables.find(candidate => candidate.id === relationship.leftTableId)
    const semantic = table?.columns.find(column => column.sourceName === relationship.leftField)?.semanticType
    return Boolean(semantic && identifiers.includes(semantic) && relationship.displayField)
  })
  return legacyCapabilities.map(capability => {
    const identifiers = capability.key === 'product_rank' ? ['product_id'] : capability.key === 'category_rank' ? ['category', 'category_id'] : []
    if (identifiers.length === 0 || !hasRankingSource(identifiers)) return capability
    return { ...capability, available: true, reason: hasDisplayRelationship(identifiers) ? undefined : `名称关系未确认，将按原始 ${identifiers[0]} 展示` }
  })
}

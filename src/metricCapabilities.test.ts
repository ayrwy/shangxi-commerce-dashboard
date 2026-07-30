import { buildBehaviorSummary, buildMetricCapabilities, buildOrderItemsSummary, buildOrderMultiTableSummary } from './metricCapabilities'
import { detectSingleTableType, granularityForRole, type FileMapping, type ImportedFile } from './importSession'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const preview = (headers: string[], rows: string[][]) => ({
  headers,
  rows,
  allRows: rows,
  totalRows: rows.length,
  delimiter: ',' as const,
  encoding: 'utf-8' as const,
  parseWarnings: [],
  parseErrors: [],
})
const imported = (id: string, headers: string[], rows: string[][]): ImportedFile => ({
  id,
  file: {} as File,
  name: id + '.csv',
  size: 1,
  lastModified: 1,
  status: 'ready',
  preview: preview(headers, rows),
})
const mapping = (
  fileId: string,
  role: FileMapping['role'],
  fields: Record<string, string>,
): FileMapping => ({
  fileId,
  role,
  behaviorValueMappings: {},
  singleTableType: detectSingleTableType({ id: fileId, file: {} as File, name: fileId + '.csv', size: 1, lastModified: 1, status: 'ready', preview: { headers: Object.keys(fields), rows: [], allRows: [], totalRows: 0, delimiter: ',', encoding: 'utf-8', parseWarnings: [], parseErrors: [] } }),
  granularity: granularityForRole[role],
  confirmed: false,
  fields: Object.entries(fields).map(([source, canonical]) => ({
    source,
    canonical,
    confidence: 'high',
  })),
})

const orders = imported('orders', ['oid', 'total'], [['A', '100'], ['A', '100'], ['B', '300']])
const refunds = imported('refunds', ['oid', 'refund'], [['A', '20'], ['B', '30']])
const orderMapping = mapping('orders', 'orders', { oid: 'order_id', total: 'order_amount' })
const refundMapping = mapping('refunds', 'refunds', { oid: 'order_id', refund: 'refund_amount' })

const summary = buildOrderMultiTableSummary([orders, refunds], [orderMapping, refundMapping])
assert(summary?.orderCount === 2, 'Duplicate order_id should not increase order count')
assert(summary?.orderGmv === 400, 'Duplicate order_id should not double-count GMV')
assert(summary?.refundAmount === 50, 'Refund amount should be summed from refund rows')
assert(summary?.refundAmountRate === 12.5, 'Amount refund rate should equal refund amount divided by order GMV')
assert(summary?.refundOrderRate === 100, 'Order refund rate should be 100% (2 of 2 orders refunded)')
assert(summary?.warning?.includes('order_id'), 'Duplicate order_id should generate a warning')

const withoutOrderAmount = mapping('orders', 'orders', { oid: 'order_id' })
const missingDenominator = buildMetricCapabilities([orders, refunds], [withoutOrderAmount, refundMapping])
const missingDenominatorRefund = missingDenominator.find(item => item.key === 'refund_rate')
assert(missingDenominatorRefund?.available === false, 'Refund rate must be unavailable without order_amount')
assert(missingDenominatorRefund?.reason?.includes('分母'), 'Missing order amount should identify the denominator')

const withoutRefundAmount = mapping('refunds', 'refunds', { oid: 'order_id' })
const missingRefundAmount = buildMetricCapabilities([orders, refunds], [orderMapping, withoutRefundAmount])
const missingRefundAmountCapability = missingRefundAmount.find(item => item.key === 'refund_rate')
assert(missingRefundAmountCapability?.available === false, 'Refund rate must be unavailable without refund_amount')
assert(missingRefundAmountCapability?.reason?.includes('退款金额'), 'Missing refund amount should be explained')

const available = buildMetricCapabilities([orders, refunds], [orderMapping, refundMapping])
assert(available.find(item => item.key === 'refund_rate')?.available === true, 'Refund rate should be available with numerator and denominator')
assert(available.find(item => item.key === 'refund_order_rate')?.available === true, 'Order refund rate should be available with refund order_id')
assert(available.find(item => item.key === 'refund_rate')?.definition.formula.includes('金额退款率'), 'Refund rate label should specify amount-based')

const mismatchedRefunds = imported('refunds-2', ['oid', 'refund'], [['UNKNOWN', '10']])
const mismatchMapping = mapping('refunds-2', 'refunds', { oid: 'order_id', refund: 'refund_amount' })
const mismatchSummary = buildOrderMultiTableSummary([orders, mismatchedRefunds], [orderMapping, mismatchMapping])
const refundRelation = mismatchSummary?.relationships.find(item => item.key === 'refunds-orders')
assert(refundRelation?.available === false && refundRelation.matched === 0, 'Relationship mismatch should be detected')

const definitions85 = buildMetricCapabilities([orders, refunds], [orderMapping, refundMapping])
for (const capability of definitions85) {
  assert(Boolean(capability.definition.source && capability.definition.granularity && capability.definition.formula && capability.definition.dedupKey), 'Every metric capability should explain source, grain, formula and dedup key')
}
assert(definitions85.find(item => item.key === 'gmv')?.definition.formula.includes('order_amount'), 'Order GMV formula should name order_amount')
assert(definitions85.find(item => item.key === 'refund_rate')?.definition.formula.includes('订单 GMV'), 'Refund rate formula should name order GMV denominator')

const behaviorHeaders = ['user_id', 'behavior', 'price', 'amount']
const behaviorFile26 = imported('UserBehavior1.csv', behaviorHeaders, [['u1', '浏览', '10', '1'], ['u1', '购买', '20', '2'], ['u2', 'buy', '5', '1'], ['u3', '收藏', '8', '1']])
const behaviorMapping26 = mapping('behavior-26', 'behavior', { user_id: 'user_id', behavior: 'behavior', price: 'price', amount: 'amount' })
behaviorMapping26.behaviorValueMappings = { '浏览': 'pv', '购买': 'buy', '收藏': 'fav' }
const behaviorSummary26 = buildBehaviorSummary(behaviorFile26, behaviorMapping26)
assert(behaviorSummary26?.purchaseBehaviors === 2, 'Chinese and English buy values should normalize to two purchases')
assert(behaviorSummary26?.gmv === 45, 'Behavior GMV should calculate price times amount for buy rows')
assert(behaviorSummary26?.behaviorValues.length === 4, 'Behavior value distribution should include raw values')
const noAmountMapping26 = mapping('behavior-no-amount', 'behavior', { user_id: 'user_id', behavior: 'behavior' })
const behaviorNoAmountFile26 = imported('UserBehavior1-no-amount.csv', ['user_id', 'behavior'], [['u1', '浏览'], ['u2', '购买'], ['u3', '收藏']])
const noAmountSummary26 = buildBehaviorSummary(behaviorNoAmountFile26, noAmountMapping26)
assert(noAmountSummary26?.gmv === null && noAmountSummary26?.funnel.find((item: { key: string }) => item.key === 'buy')?.value === 1, 'Missing price or amount should disable GMV but keep funnel')

const orderMainFile27 = imported('orders-main-27', ['order_id', 'order_amount', 'user_id', 'channel', 'datetime'], [['o1', '100', 'u1', '抖音', '2026-01-01'], ['o1', '100', 'u1', '抖音', '2026-01-01'], ['o2', '300', 'u2', '天猫', '2026-01-02']])
const orderMainMapping27 = mapping('orders-main-27', 'orders', { order_id: 'order_id', order_amount: 'order_amount', user_id: 'user_id', channel: 'channel', datetime: 'datetime' })
const orderMainSummary27 = buildOrderMultiTableSummary([orderMainFile27], [orderMainMapping27])
assert(orderMainSummary27?.orderCount === 2 && orderMainSummary27.orderGmv === 400, 'Order main table should deduplicate orders and GMV')
assert(orderMainSummary27?.averageOrderValue === 200, 'Order main table should calculate average order value')
assert(orderMainSummary27?.purchasingUsers === 2, 'Order main table should calculate unique purchasing users')
const orderMainCaps27 = buildMetricCapabilities([orderMainFile27], [orderMainMapping27])
assert(orderMainCaps27.find(item => item.key === 'channel')?.available === true, 'Order main table channel capability should be available')
assert(orderMainCaps27.find(item => item.key === 'product_rank')?.available === false, 'Order main table without item detail should not offer product ranking')
assert(orderMainCaps27.find(item => item.key === 'repeat_rate')?.available === true, 'Order main table with user_id and datetime should offer repeat rate capability')

const orderItemsFile28 = imported('order-items-28', ['order_id', 'product_id', 'price', 'amount', 'user_id', 'datetime'], [['o1', 'p1', '100', '2', 'u1', '2026-01-01'], ['o1', 'p2', '50', '1', 'u1', '2026-01-01'], ['o2', 'p1', '100', '1', 'u2', '2026-01-02']])
const orderItemsMapping28 = mapping('order-items-28', 'order_items', { order_id: 'order_id', product_id: 'product_id', price: 'price', amount: 'amount', user_id: 'user_id', datetime: 'datetime' })
const orderItemsSummary28 = buildOrderItemsSummary([orderItemsFile28], [orderItemsMapping28])
assert(orderItemsSummary28?.detailSales === 350, 'Order items detail sales should sum price * amount across all rows')
assert(orderItemsSummary28?.orderCount === 2, 'Order items should deduplicate order_id')
assert(orderItemsSummary28?.productSalesVolume === 4, 'Order items should sum amount across all rows')
assert(orderItemsSummary28?.productSalesAmount === 350, 'Order items product sales amount should equal detail sales')
assert(orderItemsSummary28?.purchasingUsers === 2, 'Order items should count unique users when user_id is present')
assert(orderItemsSummary28?.hasOrderId === true, 'Order items should detect order_id presence')
assert(orderItemsSummary28?.hasUserId === true, 'Order items should detect user_id presence')
assert(orderItemsSummary28?.productRank.length === 2, 'Order items should rank products by sales amount')
const topProduct = orderItemsSummary28?.productRank[0]
assert(topProduct?.productId === 'p1' && topProduct.salesVolume === 3 && topProduct.salesAmount === 300, 'Order items top product should be p1 with highest sales')

const orderItemsCaps28 = buildMetricCapabilities([orderItemsFile28], [orderItemsMapping28])
assert(orderItemsCaps28.find(item => item.key === 'detail_sales')?.available === true, 'Order items detail sales capability should be available')
const behaviorDetailCapability = buildMetricCapabilities([behaviorFile26], [behaviorMapping26]).find(item => item.key === 'detail_sales')
assert(behaviorDetailCapability?.available === false, 'Behavior table should not be treated as order item detail sales')
assert(behaviorDetailCapability?.reason?.includes('订单商品明细角色') === true, 'Detail sales reason should explain the required role')
assert(orderItemsCaps28.find(item => item.key === 'product_rank')?.available === true, 'Order items product rank should be available')
assert(orderItemsCaps28.find(item => item.key === 'gmv')?.available === false, 'Order items without orders main table should not show GMV')
assert(orderItemsCaps28.find(item => item.key === 'orders')?.available === true, 'Order items with order_id should show order count')
assert(orderItemsCaps28.find(item => item.key === 'buyers')?.available === true, 'Order items with user_id should show buyers')
assert(orderItemsCaps28.find(item => item.key === 'repeat_rate')?.available === true, 'Order items with user_id and datetime should show repeat rate')

const orderItemsNoUserFile28 = imported('order-items-no-user-28', ['order_id', 'product_id', 'price', 'amount'], [['o1', 'p1', '100', '2']])
const orderItemsNoUserMapping28 = mapping('order-items-no-user-28', 'order_items', { order_id: 'order_id', product_id: 'product_id', price: 'price', amount: 'amount' })
const orderItemsNoUserSummary28 = buildOrderItemsSummary([orderItemsNoUserFile28], [orderItemsNoUserMapping28])
assert(orderItemsNoUserSummary28?.purchasingUsers === null, 'Order items without user_id should return null for purchasing users')
assert(orderItemsNoUserSummary28?.hasUserId === false, 'Order items without user_id should report hasUserId false')
const noUserCaps28 = buildMetricCapabilities([orderItemsNoUserFile28], [orderItemsNoUserMapping28])
assert(noUserCaps28.find(item => item.key === 'buyers')?.available === false, 'Order items without user_id should not offer buyers')
assert(noUserCaps28.find(item => item.key === 'repeat_rate')?.available === false, 'Order items without user_id should not offer repeat rate')

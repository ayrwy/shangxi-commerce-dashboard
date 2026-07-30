import { buildModelValidation } from './metricCapabilities'
import { detectSingleTableType, emptyImportSession, normalizeImportSession, singleTableTypeConflict, updateSessionRelationship } from './importSession'
import { duplicateRoleGroups, mergeRoleFiles } from './importSession'
import { duplicateCanonicalMappings, granularityConflict, mappingsForFile, recommendedGranularity, roleFromFile, rowGranularityLabel } from './importSession'
import type { ImportedFile } from './importSession'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const imported = (name: string, headers: string[]): ImportedFile => ({
  id: name,
  file: {} as File,
  name,
  size: 1,
  lastModified: 1,
  status: 'ready',
  preview: {
    headers,
    rows: [],
    allRows: [],
    totalRows: 0,
    delimiter: ',',
    encoding: 'utf-8',
    parseWarnings: [],
    parseErrors: [],
  },
})

const behavior = imported('behavior.csv', ['user_id', 'behavior', 'datetime'])
assert(roleFromFile(behavior) === 'behavior', 'Behavior file role should be detected')
assert(recommendedGranularity(behavior) === 'behavior', 'Behavior file should recommend one behavior per row')
assert(rowGranularityLabel.behavior === '一次行为', 'Granularity labels should be user-facing Chinese')

const orders = imported('orders.csv', ['order_id', 'order_amount', 'user_id'])
const orderMapping = mappingsForFile(orders)
assert(orderMapping.granularity === 'order', 'Order table should recommend one order per row')
assert(granularityConflict('orders', 'order') === null, 'Matching order granularity should not block confirmation')
assert(granularityConflict('orders', 'order_item')?.includes('请修改角色或粒度'), 'Conflicting order granularity should block confirmation')

const wide = imported('orders-wide.csv', ['order_id', 'order_amount', 'product_id', 'price', 'amount'])
assert(recommendedGranularity(wide, 'orders') === 'order_item', 'Wide order table should recommend one order item per row')
assert(granularityConflict('orders', 'order_item')?.includes('订单主表'), 'Wide table conflict should explain the role mismatch')

const custom = imported('custom.csv', ['region', 'value'])
assert(recommendedGranularity(custom, 'unknown') === 'custom', 'Unknown schema should require custom granularity')
assert(granularityConflict('unknown', 'custom') === null, 'Custom unknown schema should remain editable')

const duplicate = { ...orderMapping, fields: [{ source: 'goods_id', canonical: 'product_id', confidence: 'manual' as const }, { source: 'sku_id', canonical: 'product_id', confidence: 'manual' as const }] }
const duplicates = duplicateCanonicalMappings(duplicate)
assert(duplicates.length === 1 && duplicates[0]?.canonical === 'product_id', 'Duplicate canonical field should be detected')
assert(duplicates[0]?.sources.join('|') === 'goods_id|sku_id', 'Duplicate mapping should list both source columns')

const missingOrder = { ...orderMapping, fields: [{ source: 'oid', canonical: 'order_id', confidence: 'high' as const }] }
const missingOrderCheck = buildModelValidation([orders], [missingOrder])
assert(missingOrderCheck.errorCount === 1 && missingOrderCheck.issues[0]?.detail.includes('order_amount'), 'Order table missing order_amount should block confirmation')

const itemFile = imported('items.csv', ['order_id', 'product_id', 'price'])
const itemMapping = mappingsForFile(itemFile)
const itemCheck = buildModelValidation([itemFile], [itemMapping])
assert(itemCheck.errorCount === 0, 'Order item table with order_id and product_id should pass core validation')

const productFile = imported('products.csv', ['product_id', 'product_name'])
const duplicateProductFile = imported('products-duplicate.csv', ['product_id', 'product_name'])
const productMapping = mappingsForFile(productFile)
const duplicateProductMapping = mappingsForFile(duplicateProductFile)
duplicateProductFile.preview!.allRows = [['p1', 'A'], ['p1', 'A copy']]
const duplicateProductCheck = buildModelValidation([duplicateProductFile], [duplicateProductMapping])
assert(duplicateProductCheck.errorCount === 1 && duplicateProductCheck.issues[0]?.detail.includes('唯一标识'), 'Duplicate product_id should block confirmation')

const blankProductFile = imported('products-blank.csv', ['product_id', 'product_name'])
blankProductFile.preview!.allRows = [['p1', 'A'], ['', 'Missing id']]
const blankProductMapping = mappingsForFile(blankProductFile)
const blankProductCheck = buildModelValidation([blankProductFile], [blankProductMapping])
assert(blankProductCheck.errorCount === 1 && blankProductCheck.issues[0]?.detail.includes('空值'), 'Blank product_id should block confirmation')

const refundFile = imported('refunds.csv', ['refund_amount'])
const refundMapping = mappingsForFile(refundFile)
const refundCheck = buildModelValidation([refundFile], [refundMapping])
assert(refundCheck.errorCount === 1 && refundCheck.issues[0]?.detail.includes('分母'), 'Refund table without order denominator should block confirmation')

const orders2 = imported('orders-2.csv', ['order_id', 'order_amount', 'user_id'])
const mapping2 = mappingsForFile(orders2)
const groups23 = duplicateRoleGroups([orderMapping, mapping2])
assert(groups23.length === 1 && groups23[0]?.role === 'orders', 'Duplicate order roles should be detected')
const merged23 = mergeRoleFiles([orders, orders2], [orderMapping, mapping2], 'orders')
assert(merged23.files.length === 1 && merged23.mappings.length === 1, 'Compatible duplicate roles should merge into one dataset')
assert(merged23.files[0]?.preview?.totalRows === 0, 'Merged empty previews should remain deterministic')
const incompatible23 = imported('orders-incompatible.csv', ['order_id', 'amount'])
const incompatibleMapping23 = mappingsForFile(incompatible23)
const failedMerge23 = mergeRoleFiles([orders, incompatible23], [orderMapping, incompatibleMapping23], 'orders')
assert(failedMerge23.files.length === 1 && failedMerge23.mappings.length === 1, 'Partially different headers should still merge on common columns')
assert(failedMerge23.preview?.compatible === true, 'Shared common headers should be detected as compatible')
assert(failedMerge23.preview?.extraHeaders.length === 2, 'Each file has unique headers not shared with the other')

const behaviorType = detectSingleTableType(behavior)
assert(behaviorType === 'behavior', 'Behavior single table should be detected')
const orderType = detectSingleTableType(orders)
assert(orderType === 'order', 'Order main single table should be detected')
const itemsType = detectSingleTableType(itemFile)
assert(itemsType === 'order_items', 'Order item single table should be detected')
const wideType = detectSingleTableType(wide)
assert(wideType === 'order_wide', 'Order wide table should be detected')
const genericFile = imported('CategoryTable.csv', ['category_id', 'category_name'])
genericFile.preview!.allRows = [['001', 'Electronics'], ['002', 'Books'], ['', 'Unknown']]
genericFile.preview!.totalRows = 3
const genericMapping = mappingsForFile(genericFile)
genericMapping.fields = genericMapping.fields.map(field => field.source === 'category_id'
  ? { ...field, canonical: 'category_id', confidence: 'manual' as const }
  : field)
const genericSession = normalizeImportSession({
  ...emptyImportSession(),
  files: [genericFile],
  mappings: [genericMapping],
})
assert(genericSession.tables.length === 1, 'Every imported file should create a generic data table')
assert(genericSession.tables[0]?.id === genericFile.id, 'Generic table id should remain stable across compatibility synchronization')
assert(genericSession.tables[0]?.suggestedLegacyRole === 'unknown', 'Legacy role should be retained only as a suggestion label')
assert(genericSession.tables[0]?.classification === 'unknown', 'Arbitrary tables should not require a legacy role classification')
assert(genericSession.tables[0]?.rowCount === 3 && genericSession.tables[0]?.columnCount === 2, 'Generic table metadata should preserve row and column counts')
assert(genericSession.tables[0]?.rows[0]?.category_id === '001', 'Generic tables should preserve arbitrary row values')
const categoryId = genericSession.tables[0]?.columns.find(column => column.sourceName === 'category_id')
assert(categoryId?.semanticType === 'category_id' && categoryId.confirmedByUser, 'Manual field semantics should synchronize into generic columns')
assert(categoryId?.dataType === 'number' && categoryId.statistics.nullRate === 1 / 3, 'Generic columns should retain inferred type and quality statistics')
assert(categoryId?.statistics.uniqueRate === 1, 'Column uniqueness should be calculated from non-empty values')

const arbitraryTableSession = normalizeImportSession({
  ...emptyImportSession(),
  tables: [{
    id: 'external-table',
    name: 'External dimension',
    sourceFileName: 'external.csv',
    importedAt: '2026-01-01T00:00:00.000Z',
    rowCount: 1,
    columnCount: 1,
    classification: 'dimension',
    columns: [{ sourceName: 'region_code', dataType: 'string', analysisRole: 'identifier', confirmedByUser: false, statistics: { nullRate: 0, uniqueRate: 1, sampleValues: ['CN'] } }],
    rows: [{ region_code: 'CN' }],
    dataVersion: 1,
  }],
})
assert(arbitraryTableSession.tables[0]?.id === 'external-table', 'Session should preserve generic tables that are not backed by legacy imported files')

const relationshipSession = updateSessionRelationship(genericSession, {
  id: 'category-display',
  leftTableId: genericFile.id,
  leftField: 'category_id',
  rightTableId: 'external-table',
  rightField: 'region_code',
  cardinality: 'many-to-one',
  displayField: 'region_name',
  matchRate: 0.9,
  rightKeyUniqueness: 1,
  confidence: 0.8,
  source: 'manual',
  status: 'confirmed',
})
assert(relationshipSession.relationships[0]?.displayField === 'region_name', 'Session should preserve arbitrary relationship configuration')
assert(relationshipSession.versions.relationships === genericSession.versions.relationships + 1, 'Relationship changes should increment the relationship version')
assert(relationshipSession.versions.analysis === genericSession.versions.analysis + 1, 'Relationship changes should invalidate the analysis version')
assert(relationshipSession.tables[0]?.dataVersion === genericSession.tables[0]!.dataVersion + 1, 'Relationship changes should increment affected table versions')

const unknownType = detectSingleTableType(custom)
assert(unknownType === 'unknown', 'Unknown single table should remain unclassified')
assert(singleTableTypeConflict('orders', 'unknown')?.includes('尚未选择'), 'Unknown type should block confirmation')

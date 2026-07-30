import { buildAnalysisModel, getConfirmedRelationships, resolveDisplayValue, resolveField } from './analysisModel'
import { emptyImportSession, type DataColumn, type DataTable, type TableRelationship } from './importSession'
import { MetricEngine } from './metricEngine'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const column = (sourceName: string, semanticType: string, analysisRole: DataColumn['analysisRole']): DataColumn => ({
  sourceName,
  semanticType,
  dataType: analysisRole === 'measure' ? 'number' : 'string',
  analysisRole,
  confirmedByUser: true,
  statistics: { nullRate: 0, uniqueRate: 1, sampleValues: [] },
})

const fact: DataTable = {
  id: 'fact',
  name: 'Sales detail',
  sourceFileName: 'sales.csv',
  importedAt: '2026-07-28T00:00:00.000Z',
  rowCount: 3,
  columnCount: 5,
  classification: 'fact',
  suggestedLegacyRole: 'unknown',
  columns: [
    column('sku', 'product_id', 'identifier'),
    column('cate', 'category_id', 'identifier'),
    column('unit_price', 'price', 'measure'),
    column('qty', 'quantity', 'measure'),
    column('order_no', 'order_id', 'identifier'),
  ],
  rows: [
    { sku: 'p1', cate: 'c1', unit_price: 10, qty: 2, order_no: 'o1' },
    { sku: 'p2', cate: 'c2', unit_price: 20, qty: 1, order_no: 'o2' },
    { sku: 'p3', cate: 'missing', unit_price: 5, qty: 1, order_no: 'o3' },
  ],
  dataVersion: 1,
}

const categories: DataTable = {
  id: 'categories',
  name: 'Categories',
  sourceFileName: 'categories.csv',
  importedAt: '2026-07-28T00:00:00.000Z',
  rowCount: 2,
  columnCount: 2,
  classification: 'dimension',
  suggestedLegacyRole: 'unknown',
  columns: [column('category_code', 'category_id', 'identifier'), column('category_name', 'category_name', 'attribute')],
  rows: [{ category_code: 'c1', category_name: 'Electronics' }, { category_code: 'c2', category_name: 'Books' }],
  dataVersion: 1,
}

const relationship: TableRelationship = {
  id: 'category-name',
  leftTableId: 'fact',
  leftField: 'cate',
  rightTableId: 'categories',
  rightField: 'category_code',
  displayField: 'category_name',
  cardinality: 'many-to-one',
  matchRate: 2 / 3,
  rightKeyUniqueness: 1,
  confidence: 0.9,
  source: 'manual',
  status: 'confirmed',
}

const session = { ...emptyImportSession(), confirmed: true, tables: [fact, categories], relationships: [relationship] }
const model = buildAnalysisModel(session)
assert(model?.tables.length === 2, 'Analysis model should retain every generic table, including unknown legacy roles')
assert(resolveField(model!, 'category_id')[0]?.tableId === 'fact', 'Semantic fields should resolve independently of file role')
assert(getConfirmedRelationships(model!).length === 1, 'Analysis model should expose only confirmed relationships')
assert(resolveDisplayValue(model!, 'fact', 'cate', 'c1') === 'Electronics', 'Confirmed relationships should resolve readable display values')
assert(resolveDisplayValue(model!, 'fact', 'cate', 'missing') === 'missing', 'Unmatched values should safely fall back to the original id')

const engine = new MetricEngine(model!)
const categoryRanking = engine.getCategoryRanking()
assert(categoryRanking.some(row => row.category === 'Electronics' && row.categoryId === 'c1'), 'Category ranking should expose display name and original id')
assert(categoryRanking.some(row => row.category === 'missing' && row.categoryId === 'missing'), 'Category ranking should preserve unmatched ids')
const productRanking = engine.getProductRanking()
assert(productRanking.length === 3 && productRanking[0]?.productId === 'p1', 'Product ranking should be driven by semantic fields without an order_items role')
assert(productRanking[0]?.productName === 'p1', 'Product ranking should fall back to the original id without a confirmed name relationship')
assert(engine.getCategoryRanking() === categoryRanking, 'Metric engine should reuse ranking cache for the same model version and filters')

const disabledModel = buildAnalysisModel({ ...session, relationships: [{ ...relationship, status: 'disabled' }], versions: { ...session.versions, relationships: 2, analysis: 2 } })
assert(resolveDisplayValue(disabledModel!, 'fact', 'cate', 'c1') === 'c1', 'Disabled relationships should immediately fall back to raw ids')
assert(disabledModel?.cacheKey !== model?.cacheKey, 'Relationship version changes should invalidate analysis caches')

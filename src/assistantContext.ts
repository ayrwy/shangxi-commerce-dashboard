import { buildAnalysisModel, getConfirmedRelationships } from './analysisModel'
import type { ImportSession } from './importSession'
import { MetricEngine, type MetricFilters } from './metricEngine'

export type AssistantViz = { title: string; kind: 'bars' | 'funnel'; rows: { label: string; value: number; detail?: string }[] }

export const runAssistantTools = (session: ImportSession, question: string, filters: MetricFilters) => {
  const model = buildAnalysisModel(session)
  const engine = model ? new MetricEngine(model) : null
  if (!engine) return { tools: ['dataset_status'], metrics: [], categories: [], products: [], funnel: [], dimensions: {}, viz: undefined as AssistantViz | undefined }
  const lower = question.toLowerCase()
  const metrics = engine.computeAll(filters).filter(metric => metric.available).map(metric => ({ key: metric.key, label: metric.label, value: metric.value, formatted: metric.formatted, definition: metric.definition }))
  const categories = engine.getCategoryRanking(filters)
  const products = engine.getProductRanking(filters)
  const funnel = engine.getFunnelDistribution(filters)
  const dimensions = engine.getDimensionDistribution(filters)
  const tools = ['compute_metrics']
  if (lower.includes('类目') || lower.includes('category')) tools.push('get_category_ranking')
  if (lower.includes('商品') || lower.includes('产品')) tools.push('get_product_ranking')
  if (lower.includes('漏斗') || lower.includes('行为')) tools.push('get_funnel_distribution')
  if (lower.includes('设备') || lower.includes('地区') || lower.includes('地址') || lower.includes('城市')) tools.push('get_dimension_distribution')
  const viz: AssistantViz | undefined = lower.includes('漏斗') || lower.includes('行为')
    ? { title: '行为漏斗', kind: 'funnel', rows: funnel }
    : lower.includes('类目')
      ? { title: '类目排行', kind: 'bars', rows: categories.map(row => ({ label: row.category, value: row.salesAmount || row.salesVolume, detail: `原始 ID ${row.categoryId}` })) }
      : lower.includes('商品') || lower.includes('产品')
        ? { title: '商品排行', kind: 'bars', rows: products.map(row => ({ label: row.productName, value: row.salesAmount, detail: `原始 ID ${row.productId} · ${row.salesVolume} 件` })) }
        : undefined
  return { tools, metrics, categories, products, funnel, dimensions, viz }
}

export const buildAssistantContext = (session: ImportSession, question: string, filters: MetricFilters): { context: string; viz?: AssistantViz } => {
  const model = buildAnalysisModel(session)
  const analysis = runAssistantTools(session, question, filters)
  const payload = {
    data_version: model?.cacheKey ?? null,
    filters,
    policy: {
      relationship_usage: 'Only confirmed relationships may be used.',
      unmatched_values: 'Use the original id when no display value matches.',
      response_shape: 'When returning products or categories, retain both raw id and display name.',
    },
    tables: session.tables.map(table => ({ id: table.id, name: table.name, classification: table.classification, rowCount: table.rowCount, columns: table.columns.map(column => ({ sourceName: column.sourceName, semanticType: column.semanticType, dataType: column.dataType })) })),
    confirmed_relationships: model ? getConfirmedRelationships(model) : [],
    unresolved_relationships: session.relationships.filter(relationship => relationship.status !== 'confirmed').map(relationship => ({ id: relationship.id, status: relationship.status, confidence: relationship.confidence })),
    relationship_diagnostics: session.relationshipDiagnostics,
    tools_called: analysis.tools,
    results: analysis,
  }
  return { context: JSON.stringify(payload, null, 2), viz: analysis.viz }
}

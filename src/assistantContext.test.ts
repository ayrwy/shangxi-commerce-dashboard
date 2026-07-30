import { buildAssistantContext, runAssistantTools } from './assistantContext'
import { emptyImportSession, type DataColumn, type DataTable, type TableRelationship } from './importSession'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const column = (sourceName: string, semanticType: string, analysisRole: DataColumn['analysisRole']): DataColumn => ({ sourceName, semanticType, dataType: analysisRole === 'measure' ? 'number' : 'string', analysisRole, confirmedByUser: true, statistics: { nullRate: 0, uniqueRate: 1, sampleValues: [] } })
const table = (id: string, columns: DataColumn[], rows: Record<string, unknown>[], classification: DataTable['classification']): DataTable => ({ id, name: id, sourceFileName: `${id}.csv`, importedAt: '2026-07-28T00:00:00.000Z', rowCount: rows.length, columnCount: columns.length, classification, suggestedLegacyRole: 'unknown', columns, rows, dataVersion: 1 })

const facts = table('facts', [column('category_id', 'category_id', 'identifier'), column('price', 'price', 'measure'), column('quantity', 'quantity', 'measure')], [{ category_id: 'c1', price: 10, quantity: 2 }, { category_id: 'missing', price: 5, quantity: 1 }], 'fact')
const dimensions = table('dimensions', [column('code', 'category_id', 'identifier'), column('name', 'category_name', 'attribute')], [{ code: 'c1', name: 'Electronics' }], 'dimension')
const confirmed: TableRelationship = { id: 'confirmed', leftTableId: 'facts', leftField: 'category_id', rightTableId: 'dimensions', rightField: 'code', displayField: 'name', cardinality: 'many-to-one', matchRate: 0.5, rightKeyUniqueness: 1, confidence: 0.9, source: 'manual', status: 'confirmed' }
const suggested: TableRelationship = { ...confirmed, id: 'suggested', status: 'suggested', displayField: undefined }
const session = { ...emptyImportSession(), confirmed: true, tables: [facts, dimensions], relationships: [confirmed, suggested], relationshipDiagnostics: [{ code: 'low-match-rate' as const, severity: 'warning' as const, relationshipId: 'confirmed', message: 'low match', samples: ['missing'] }] }

const tools = runAssistantTools(session, '哪个类目最高', {})
const categories = tools.categories as { category: string; categoryId: string }[]
assert(categories.some(row => row.category === 'Electronics' && row.categoryId === 'c1'), 'Assistant tools should return display name and raw category id')
assert(categories.some(row => row.category === 'missing' && row.categoryId === 'missing'), 'Assistant tools should preserve unmatched raw ids')
const context = JSON.parse(buildAssistantContext(session, '哪个类目最高', { channel: 'web' }).context) as Record<string, any>
assert(context.data_version === '1:1:1:1', 'Assistant context should include the current analysis version')
assert(context.filters.channel === 'web', 'Assistant context should include the actual filters')
assert(context.confirmed_relationships.length === 1 && context.confirmed_relationships[0].id === 'confirmed', 'Assistant context should expose only confirmed relationships as usable relationships')
assert(context.unresolved_relationships.some((relationship: { id: string }) => relationship.id === 'suggested'), 'Assistant context should separately disclose unresolved relationships')
assert(context.relationship_diagnostics[0].message === 'low match', 'Assistant context should disclose relationship risks')
assert(context.policy.response_shape.includes('raw id'), 'Assistant context should require structured id and display-name results')

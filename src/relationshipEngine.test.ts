import { discoverTableRelationships, evaluateManualRelationship, synchronizeDiscoveredRelationships } from './relationshipEngine'
import { emptyImportSession, updateSessionRelationship, type ColumnAnalysisRole, type ColumnDataType, type DataColumn, type DataTable } from './importSession'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const column = (
  sourceName: string,
  semanticType: string | undefined,
  dataType: ColumnDataType = 'string',
  analysisRole: ColumnAnalysisRole = 'identifier',
): DataColumn => ({
  sourceName,
  semanticType,
  dataType,
  analysisRole,
  confirmedByUser: Boolean(semanticType),
  statistics: { nullRate: 0, uniqueRate: 1, sampleValues: [] },
})

const table = (
  id: string,
  columns: DataColumn[],
  rows: Record<string, unknown>[],
  classification: DataTable['classification'] = 'unknown',
): DataTable => ({
  id,
  name: id,
  sourceFileName: `${id}.csv`,
  importedAt: '2026-07-28T00:00:00.000Z',
  rowCount: rows.length,
  columnCount: columns.length,
  classification,
  columns,
  rows,
  dataVersion: 1,
})

const behavior = table('behavior', [
  column('category_id', 'category_id'),
  column('event_name', 'behavior', 'string', 'dimension'),
], [
  { category_id: '001', event_name: 'view' },
  { category_id: '001', event_name: 'buy' },
  { category_id: '002', event_name: 'view' },
  { category_id: '003', event_name: 'view' },
], 'fact')

const categories = table('categories', [
  column('categoryId', 'category_id'),
  column('category_name', 'category_name', 'string', 'attribute'),
], [
  { categoryId: '001', category_name: 'Electronics' },
  { categoryId: '002', category_name: 'Books' },
  { categoryId: '003', category_name: 'Home' },
], 'dimension')

const discovered = discoverTableRelationships([behavior, categories])
assert(discoverTableRelationships([behavior, categories]) === discovered, 'Relationship discovery should reuse cached results for unchanged table versions')
const categoryRelationship = discovered.relationships.find(item => item.leftTableId === 'behavior' && item.rightTableId === 'categories')
assert(categoryRelationship, 'Same semantic key should produce a relationship candidate across arbitrary tables')
assert(categoryRelationship?.leftField === 'category_id' && categoryRelationship.rightField === 'categoryId', 'Candidate should retain original field names')
assert(categoryRelationship?.cardinality === 'many-to-one', 'Repeated fact keys and a unique dimension key should be many-to-one')
assert(categoryRelationship?.matchRate === 1, 'Numeric and string ids should match after safe string normalization')
assert(categoryRelationship?.rightKeyUniqueness === 1, 'Unique right key should be reported')
assert(categoryRelationship?.displayField === 'category_name', 'Dimension name field should be suggested for display')
assert(categoryRelationship?.status === 'suggested' && categoryRelationship.source === 'auto', 'Automatic discovery must never auto-confirm a relationship')
assert((categoryRelationship?.confidence ?? 0) >= 0.85, 'Strong semantic, value, and uniqueness evidence should score highly')

const partialCategories = table('partial-categories', [
  column('category_id', 'category_id'),
  column('category_name', 'category_name', 'string', 'attribute'),
], [
  { category_id: '001', category_name: 'Electronics' },
], 'dimension')
const partial = discoverTableRelationships([behavior, partialCategories])
const partialRelationship = partial.relationships.find(item => item.leftTableId === 'behavior')
assert(partialRelationship?.matchRate === 1 / 3, 'Match rate should use distinct non-empty source keys')
assert(partialRelationship?.evidence.unmatchedLeftCount === 2, 'Evidence should report unmatched distinct keys')
assert(partialRelationship?.diagnostics.some(item => item.code === 'low-match-rate'), 'Low match rate should produce a diagnostic instead of confirmation')

const conflictingCategories = table('conflicting-categories', [
  column('category_id', 'category_id'),
  column('category_name', 'category_name', 'string', 'attribute'),
], [
  { category_id: '001', category_name: 'Electronics' },
  { category_id: '001', category_name: 'Digital' },
  { category_id: '002', category_name: 'Books' },
], 'dimension')
const conflicting = discoverTableRelationships([behavior, conflictingCategories])
const conflictingRelationship = conflicting.relationships.find(item => item.leftTableId === 'behavior')
assert(conflictingRelationship?.diagnostics.some(item => item.code === 'duplicate-right-key' && item.severity === 'blocking'), 'Duplicate dimension keys should block name mapping')
assert(conflictingRelationship?.diagnostics.some(item => item.code === 'conflicting-right-label' && item.samples.includes('001')), 'Conflicting names for one key should include diagnostic samples')
assert(conflictingRelationship?.diagnostics.some(item => item.code === 'many-to-many'), 'Duplicates on both sides should report data expansion risk')

const unrelated = table('unrelated', [column('order_id', 'order_id')], [{ order_id: 'o-1' }])
assert(discoverTableRelationships([behavior, unrelated]).relationships.length === 0, 'Different semantics without value overlap should not become candidates')

const categoriesCopy = table('categories-copy', [
  column('category_code', 'category_id'),
  column('category_label', 'category_name', 'string', 'attribute'),
], [
  { category_code: '001', category_label: 'Electronics' },
  { category_code: '002', category_label: 'Books' },
  { category_code: '003', category_label: 'Home' },
], 'dimension')
const ambiguous = discoverTableRelationships([behavior, categories, categoriesCopy])
const behaviorCandidates = ambiguous.relationships.filter(item => item.leftTableId === 'behavior')
assert(behaviorCandidates.length === 2, 'Multiple matching dimension tables should remain separate candidates')
assert(behaviorCandidates.every(item => item.diagnostics.some(diagnostic => diagnostic.code === 'ambiguous-target')), 'Multiple targets should require the user to select a primary relationship')

const leadingZeroFacts = table('leading-zero-facts', [column('member_id', 'member_id')], [{ member_id: '001' }], 'fact')
const numericMembers = table('numeric-members', [column('member_id', 'member_id', 'number')], [{ member_id: 1 }], 'dimension')
assert(discoverTableRelationships([leadingZeroFacts, numericMembers]).relationships.length === 0, 'Leading zeros must be preserved and must not be silently removed during joins')

const stringNumberFacts = table('string-number-facts', [column('member_id', 'member_id')], [{ member_id: '1' }], 'fact')
assert(discoverTableRelationships([stringNumberFacts, numericMembers]).relationships[0]?.matchRate === 1, 'Equivalent numeric and string ids should match without coercing away formatting')

const sessionWithTables = {
  ...emptyImportSession(),
  tables: [behavior, categories],
}
const synchronized = synchronizeDiscoveredRelationships(sessionWithTables)
assert(synchronized.relationships.length === 1, 'Discovered candidates should be written into the import session')
assert(synchronized.relationships[0]?.evidence?.matchedDistinctCount === 3, 'Persisted candidates should retain scoring evidence')
assert(synchronized.versions.relationships === sessionWithTables.versions.relationships + 1, 'New candidates should increment the relationship version')
assert(synchronizeDiscoveredRelationships(synchronized) === synchronized, 'Synchronizing unchanged tables should be idempotent')

const confirmedSession = updateSessionRelationship(synchronized, {
  ...synchronized.relationships[0]!,
  status: 'confirmed',
  displayField: 'category_name',
})
const refreshedConfirmed = synchronizeDiscoveredRelationships(confirmedSession)
assert(refreshedConfirmed.relationships[0]?.status === 'confirmed', 'Rediscovery should preserve a user-confirmed status')
assert(refreshedConfirmed.relationships[0]?.displayField === 'category_name', 'Rediscovery should preserve a user-selected display field')

const rejectedSession = updateSessionRelationship(synchronized, {
  ...synchronized.relationships[0]!,
  status: 'rejected',
})
assert(synchronizeDiscoveredRelationships(rejectedSession).relationships[0]?.status === 'rejected', 'Rediscovery should not revive a rejected candidate')

const manualRelationship = {
  id: 'manual-region',
  leftTableId: 'behavior',
  leftField: 'category_id',
  rightTableId: 'categories',
  rightField: 'categoryId',
  cardinality: 'many-to-one' as const,
  matchRate: 1,
  rightKeyUniqueness: 1,
  confidence: 1,
  source: 'manual' as const,
  status: 'confirmed' as const,
}
const manualSession = updateSessionRelationship(sessionWithTables, manualRelationship)
const preservedManual = synchronizeDiscoveredRelationships(manualSession)
assert(preservedManual.relationships.some(item => item.id === 'manual-region'), 'Automatic discovery should preserve manually-created relationships')

const manualOverride = updateSessionRelationship(synchronized, {
  ...synchronized.relationships[0]!,
  source: 'manual',
  status: 'confirmed',
})
const synchronizedOverride = synchronizeDiscoveredRelationships(manualOverride)
assert(synchronizedOverride.relationships.length === 1, 'A manual override of an automatic candidate should not create a duplicate relationship')
assert(synchronizedOverride.relationships[0]?.source === 'manual', 'A manual override should retain its source after rediscovery')

const diagnosticsSession = synchronizeDiscoveredRelationships({ ...emptyImportSession(), tables: [behavior, conflictingCategories] })
assert(diagnosticsSession.relationshipDiagnostics.some(item => item.code === 'duplicate-right-key'), 'Relationship diagnostics should be persisted in the import session')

const withoutDimension = synchronizeDiscoveredRelationships({ ...synchronized, tables: [behavior] })
assert(withoutDimension.relationships.length === 0, 'Obsolete unconfirmed suggestions should be removed after tables change')

const changedCategories = { ...categories, dataVersion: 2 }
assert(discoverTableRelationships([behavior, changedCategories]) !== discovered, 'Table version changes should invalidate the relationship discovery cache')

const manualEvaluation = evaluateManualRelationship([behavior, categories], {
  leftTableId: 'behavior',
  leftField: 'category_id',
  rightTableId: 'categories',
  rightField: 'categoryId',
  displayField: 'category_name',
})
assert(manualEvaluation?.source === 'manual' && manualEvaluation.matchRate === 1, 'Manual relationship setup should provide the same live validation evidence')
assert(evaluateManualRelationship([behavior], {
  leftTableId: 'behavior',
  leftField: 'category_id',
  rightTableId: 'behavior',
  rightField: 'category_id',
}) === null, 'Manual relationship setup should reject self relationships')

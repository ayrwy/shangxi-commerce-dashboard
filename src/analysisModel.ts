import type { DataTable, FileRole, ImportSession, TableRelationship } from './importSession'

export type AnalysisColumn = {
  canonical: string
  source: string
  index: number
}

export type AnalysisTable = {
  id: string
  role: FileRole
  classification: DataTable['classification']
  name: string
  columns: AnalysisColumn[]
  rows: string[][]
  rowCount: number
}

export type ResolvedField = {
  tableId: string
  tableName: string
  field: string
  semanticType: string
  role: FileRole
}

export type AnalysisModel = {
  version: 2
  cacheKey: string
  mode: 'behavior' | 'orders' | 'custom'
  tables: AnalysisTable[]
  relationships: TableRelationship[]
  displayIndexes: Map<string, Map<string, string>>
  createdAt: string
}

const numeric = (value: string) => Number((value ?? '').replace(/[,\u00a5$￥]/g, '')) || 0
const canonicalAliases: Record<string, string[]> = {
  amount: ['amount', 'quantity'],
  quantity: ['quantity', 'amount'],
  category: ['category', 'category_id'],
  category_id: ['category_id', 'category'],
  category_label: ['category_label', 'category_name', 'categoryname', 'label', 'name'],
}
const aliasesFor = (semanticType: string) => canonicalAliases[semanticType] ?? [semanticType]

const extractGenericTable = (table: DataTable): AnalysisTable => {
  const columns = table.columns.map((column, index) => ({
    canonical: column.semanticType ?? '',
    source: column.sourceName,
    index,
  }))
  const rows = table.rows.map(row => table.columns.map(column => {
    const value = row[column.sourceName]
    return value === null || value === undefined ? '' : String(value)
  }))
  return {
    id: table.id,
    role: table.suggestedLegacyRole ?? 'unknown',
    classification: table.classification,
    name: table.name,
    columns,
    rows,
    rowCount: rows.length,
  }
}

const buildDisplayIndexes = (tables: DataTable[], relationships: TableRelationship[]) => {
  const indexes = new Map<string, Map<string, string>>()
  relationships.forEach(relationship => {
    if (relationship.status !== 'confirmed' || !relationship.displayField) return
    const rightTable = tables.find(table => table.id === relationship.rightTableId)
    if (!rightTable) return
    const displayIndex = new Map<string, string>()
    rightTable.rows.forEach(row => {
      const keyValue = row[relationship.rightField]
      const displayValue = row[relationship.displayField!]
      const key = keyValue === null || keyValue === undefined ? '' : String(keyValue).trim()
      const display = displayValue === null || displayValue === undefined ? '' : String(displayValue).trim()
      if (key && display && !displayIndex.has(key)) displayIndex.set(key, display)
    })
    indexes.set(`${relationship.leftTableId}:${relationship.leftField}`, displayIndex)
  })
  return indexes
}

export const buildAnalysisModel = (session: ImportSession): AnalysisModel | null => {
  if (!session.confirmed || session.tables.length === 0) return null
  const tables = session.tables.map(extractGenericTable)
  const hasBehavior = tables.some(table => table.role === 'behavior')
  const hasOrders = tables.some(table => table.role === 'orders' || table.role === 'order_items')
  const mode = session.mode !== 'custom' ? session.mode : hasBehavior && !hasOrders ? 'behavior' : hasOrders ? 'orders' : 'custom'
  const relationships = session.relationships.filter(relationship => relationship.status === 'confirmed')
  const cacheKey = [session.versions.data, session.versions.mappings, session.versions.relationships, session.versions.analysis].join(':')
  return {
    version: 2,
    cacheKey,
    mode,
    tables,
    relationships,
    displayIndexes: buildDisplayIndexes(session.tables, relationships),
    createdAt: new Date().toISOString(),
  }
}

export const columnIndexOf = (table: AnalysisTable, canonical: string): number | undefined => {
  const aliases = aliasesFor(canonical)
  const column = table.columns.find(candidate => aliases.includes(candidate.canonical))
  return column?.index
}

export const tableByRole = (model: AnalysisModel, role: FileRole): AnalysisTable | undefined =>
  model.tables.find(table => table.role === role)

export const tablesWithFields = (model: AnalysisModel, ...semanticTypes: string[]): AnalysisTable[] =>
  model.tables.filter(table => semanticTypes.every(semanticType => columnIndexOf(table, semanticType) !== undefined))

export const resolveField = (model: AnalysisModel, semanticType: string): ResolvedField[] => {
  const aliases = aliasesFor(semanticType)
  return model.tables.flatMap(table => table.columns
    .filter(column => aliases.includes(column.canonical))
    .map(column => ({ tableId: table.id, tableName: table.name, field: column.source, semanticType: column.canonical, role: table.role })))
}

export const getConfirmedRelationships = (model: AnalysisModel, tableId?: string): TableRelationship[] =>
  model.relationships.filter(relationship => !tableId || relationship.leftTableId === tableId || relationship.rightTableId === tableId)

export const resolveDisplayValue = (
  model: AnalysisModel,
  tableId: string,
  field: string,
  rawValue: unknown,
): string => {
  const raw = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim()
  if (!raw) return raw
  return model.displayIndexes.get(`${tableId}:${field}`)?.get(raw) ?? raw
}

export const columnValuesByCanonical = (table: AnalysisTable | undefined, canonical: string): string[] => {
  if (!table) return []
  const index = columnIndexOf(table, canonical)
  if (index === undefined) return []
  return table.rows.map(row => (row[index] ?? '').trim()).filter(Boolean)
}

export const numericColumnValues = (table: AnalysisTable | undefined, canonical: string): number[] => {
  if (!table) return []
  const index = columnIndexOf(table, canonical)
  if (index === undefined) return []
  return table.rows.map(row => numeric(row[index] ?? '')).filter(value => !Number.isNaN(value))
}

export const hasCanonical = (table: AnalysisTable | undefined, ...canonicals: string[]): boolean =>
  Boolean(table && canonicals.every(canonical => columnIndexOf(table, canonical) !== undefined))

export const distinctValues = (values: string[]): string[] => [...new Set(values.filter(Boolean))]

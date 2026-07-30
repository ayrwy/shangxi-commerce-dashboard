export type FileStatus = 'queued' | 'reading' | 'ready' | 'warning' | 'error'

export type CsvPreview = {
  headers: string[]
  rows: string[][]
  allRows?: string[][]
  totalRows: number
  delimiter: ',' | ';' | '\t'
  encoding: 'utf-8' | 'gb18030' | 'unknown'
  parseWarnings: string[]
  parseErrors: string[]
}

export type ImportedFile = {
  id: string
  file: File
  name: string
  size: number
  lastModified: number
  status: FileStatus
  preview?: CsvPreview
  error?: string
  progress?: number
}

// Dimension tables are generic lookup tables (category, brand, region, ...).
// Keep `categories` as a legacy alias at the boundary for persisted sessions.
export type FileRole = 'behavior' | 'orders' | 'order_items' | 'products' | 'dimension' | 'categories' | 'users' | 'refunds' | 'unknown'
export type SingleTableType = 'behavior' | 'order' | 'order_items' | 'order_wide' | 'unknown'
export type RowGranularity = 'behavior' | 'order' | 'order_item' | 'product' | 'user' | 'refund' | 'custom'

export type TableClassification = 'fact' | 'dimension' | 'mixed' | 'unknown'
export type ColumnDataType = 'string' | 'number' | 'datetime' | 'boolean' | 'unknown'
export type ColumnAnalysisRole = 'identifier' | 'dimension' | 'measure' | 'time' | 'attribute'

export type DataColumnStatistics = {
  nullRate: number
  uniqueRate: number
  sampleValues: unknown[]
}

export type DataColumn = {
  sourceName: string
  semanticType?: string
  businessMeaning?: string
  dataType: ColumnDataType
  analysisRole: ColumnAnalysisRole
  confidence?: number
  confirmedByUser: boolean
  statistics: DataColumnStatistics
}

export type DataTable = {
  id: string
  name: string
  sourceFileName: string
  importedAt: string
  rowCount: number
  columnCount: number
  classification: TableClassification
  suggestedLegacyRole?: FileRole
  columns: DataColumn[]
  rows: Record<string, unknown>[]
  dataVersion: number
}

export type TableRelationship = {
  id: string
  leftTableId: string
  leftField: string
  rightTableId: string
  rightField: string
  cardinality: 'one-to-one' | 'many-to-one'
  displayField?: string
  matchRate: number
  rightKeyUniqueness: number
  confidence: number
  source: 'auto' | 'manual'
  status: 'suggested' | 'confirmed' | 'rejected' | 'disabled'
  evidence?: RelationshipEvidence
}

export type RelationshipEvidence = {
  semanticSimilarity: number
  nameSimilarity: number
  typeCompatibility: number
  valueOverlap: number
  rightKeyUniqueness: number
  rightHasDisplayField: boolean
  leftDistinctCount: number
  rightDistinctCount: number
  matchedDistinctCount: number
  unmatchedLeftCount: number
  leftEmptyCount: number
  rightEmptyCount: number
  unmatchedLeftSamples: string[]
}

export type RelationshipDiagnosticCode =
  | 'low-match-rate'
  | 'duplicate-right-key'
  | 'conflicting-right-label'
  | 'many-to-many'
  | 'empty-key'
  | 'ambiguous-target'

export type RelationshipDiagnostic = {
  code: RelationshipDiagnosticCode
  severity: 'warning' | 'blocking'
  relationshipId: string
  message: string
  samples: string[]
}

export type PerformanceDiagnostic = {
  key: 'relationship-discovery' | 'import-size'
  severity: 'info' | 'warning' | 'error'
  message: string
  durationMs?: number
  processedRows?: number
  generatedAt: string
}

export type ImportSessionVersions = {
  data: number
  mappings: number
  relationships: number
  analysis: number
}

export type DimensionType = 'text' | 'numeric' | 'date' | 'ignore'

export type FieldMapping = {
  source: string
  canonical: string
  confidence: 'high' | 'medium' | 'low' | 'manual'
  reason?: string
  dimensionType?: DimensionType
}

export type DuplicateCanonicalMapping = {
  canonical: string
  sources: string[]
}

export type FileMapping = {
  fileId: string
  role: FileRole
  singleTableType: SingleTableType
  granularity: RowGranularity
  fields: FieldMapping[]
  behaviorValueMappings: Record<string, string>
  confirmed: boolean
}

export type DuplicateRoleAction = 'merge' | 'separate' | 'replace' | 'cancel'
export type DuplicateRoleDecision = { role: FileRole; action: DuplicateRoleAction; fileId?: string }
export type DuplicateRoleGroup = { role: FileRole; fileIds: string[] }
export type RelationshipDecision = { key: string; confirmedCardinality?: boolean }

export type MergePreview = {
  role: FileRole
  files: { name: string; rows: number; headers: string[] }[]
  commonHeaders: string[]
  extraHeaders: { file: string; headers: string[] }[]
  missingHeaders: { file: string; headers: string[] }[]
  totalRows: number
  compatible: boolean
  issue: string | null
}

export type MetricDefinition = {
  source: string
  granularity: string
  formula: string
  dedupKey: string
}

export type MetricCapability = {
  key: string
  label: string
  available: boolean
  reason?: string
  requiredFields?: string[]
  definition: MetricDefinition
}

export type ImportSession = {
  files: ImportedFile[]
  mappings: FileMapping[]
  tables: DataTable[]
  relationships: TableRelationship[]
  relationshipDiagnostics: RelationshipDiagnostic[]
  performanceDiagnostics: PerformanceDiagnostic[]
  versions: ImportSessionVersions
  mode: 'behavior' | 'orders' | 'custom'
  capabilities: MetricCapability[]
  duplicateRoleDecisions: DuplicateRoleDecision[]
  relationshipDecisions: RelationshipDecision[]
  confirmed: boolean
}

export type MappingTemplate = {
  version: 1
  name: string
  createdAt: string
  mappings: FileMapping[]
}

export const emptyImportSession = (): ImportSession => ({
  files: [],
  mappings: [],
  tables: [],
  relationships: [],
  relationshipDiagnostics: [],
  performanceDiagnostics: [],
  versions: { data: 1, mappings: 1, relationships: 1, analysis: 1 },
  mode: 'custom',
  capabilities: [],
  duplicateRoleDecisions: [],
  relationshipDecisions: [],
  confirmed: false,
})

export const createFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`
export const createTableId = () => crypto.randomUUID()

const defaultVersions = (): ImportSessionVersions => ({ data: 1, mappings: 1, relationships: 1, analysis: 1 })

const inferColumnDataType = (values: string[]): ColumnDataType => {
  const nonEmpty = values.map(value => value.trim()).filter(Boolean)
  if (nonEmpty.length === 0) return 'unknown'
  if (nonEmpty.every(value => /^(true|false|yes|no)$/i.test(value))) return 'boolean'
  if (nonEmpty.every(value => /^[+-]?\d+(\.\d+)?$/.test(value))) return 'number'
  if (nonEmpty.every(value => !Number.isNaN(Date.parse(value)))) return 'datetime'
  return 'string'
}

const analysisRoleFor = (semanticType: string | undefined, dataType: ColumnDataType): ColumnAnalysisRole => {
  if (semanticType?.endsWith('_id')) return 'identifier'
  if (semanticType && ['datetime', 'refund_at'].includes(semanticType)) return 'time'
  if (semanticType && ['price', 'quantity', 'sales_amount', 'order_amount', 'refund_amount'].includes(semanticType)) return 'measure'
  if (dataType === 'datetime') return 'time'
  return semanticType ? 'dimension' : 'attribute'
}

const classificationForRole = (role: FileRole | undefined): TableClassification => {
  if (role && ['products', 'dimension', 'categories', 'users'].includes(role)) return 'dimension'
  if (role && ['behavior', 'orders', 'order_items', 'refunds'].includes(role)) return 'fact'
  return 'unknown'
}

export const dataTableFromImportedFile = (
  file: ImportedFile,
  mapping?: FileMapping,
  previous?: DataTable,
): DataTable => {
  const headers = file.preview?.headers ?? []
  const sourceRows = file.preview?.allRows ?? file.preview?.rows ?? []
  // Field edits change semantic metadata, not row contents. Reuse the existing
  // object rows so a dropdown click does not rebuild hundreds of thousands of rows.
  const rowCount = file.preview?.totalRows ?? sourceRows.length
  const canReuseRows = Boolean(previous && previous.sourceFileName === file.name && previous.rowCount === rowCount && previous.columnCount === headers.length)
  const rows = canReuseRows
    ? previous!.rows
    : sourceRows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  const columns = headers.map((sourceName, index): DataColumn => {
    const field = mapping?.fields.find(candidate => candidate.source === sourceName)
    const semanticType = field?.canonical || undefined
    const previousColumn = previous?.columns.find(column => column.sourceName === sourceName)
    const values = previousColumn ? [] : sourceRows.map(row => row[index] ?? '')
    const nonEmpty = previousColumn ? [] : values.filter(value => value.trim() !== '')
    const dataType = previousColumn?.dataType ?? inferColumnDataType(values)
    const uniqueValues = previousColumn ? null : new Set(nonEmpty)
    return {
      sourceName,
      semanticType,
      dataType,
      analysisRole: analysisRoleFor(semanticType, dataType),
      confidence: field ? ({ high: 0.95, medium: 0.7, low: 0.4, manual: 1 } as const)[field.confidence] : undefined,
      confirmedByUser: field?.confidence === 'manual' || Boolean(mapping?.confirmed),
      statistics: {
        nullRate: previousColumn?.statistics.nullRate ?? (values.length > 0 ? (values.length - nonEmpty.length) / values.length : 0),
        uniqueRate: previousColumn?.statistics.uniqueRate ?? (nonEmpty.length > 0 ? uniqueValues!.size / nonEmpty.length : 0),
        sampleValues: previousColumn?.statistics.sampleValues ?? [...uniqueValues!].slice(0, 5),
      },
    }
  })
  const legacyRole = mapping?.role ?? previous?.suggestedLegacyRole
  const columnSignature = (items: DataColumn[]) => items
    .map(column => `${column.sourceName}:${column.semanticType ?? ''}:${column.confirmedByUser}`)
    .join('|')
  const tableChanged = Boolean(previous) && (
    previous?.rowCount !== rowCount ||
    previous?.columnCount !== headers.length ||
    columnSignature(previous?.columns ?? []) !== columnSignature(columns)
  )
  return {
    id: file.id,
    name: previous?.name ?? file.name.replace(/\.csv$/i, ''),
    sourceFileName: file.name,
    importedAt: previous?.importedAt ?? new Date().toISOString(),
    rowCount,
    columnCount: headers.length,
    classification: previous?.classification ?? classificationForRole(legacyRole),
    suggestedLegacyRole: legacyRole,
    columns,
    rows,
    dataVersion: (previous?.dataVersion ?? 1) + (tableChanged ? 1 : 0),
  }
}

export const normalizeImportSession = (session: Partial<ImportSession>): ImportSession => {
  const base = emptyImportSession()
  const files = session.files ?? []
  const mappings = session.mappings ?? []
  const existingTables = session.tables ?? []
  const importedFileIds = new Set(files.map(file => file.id))
  const tables = [
    ...existingTables.filter(table => !importedFileIds.has(table.id)),
    ...files.map(file => dataTableFromImportedFile(
      file,
      mappings.find(mapping => mapping.fileId === file.id),
      existingTables.find(table => table.id === file.id),
    )),
  ]
  const currentVersions = { ...defaultVersions(), ...(session.versions ?? {}) }
  const dataSignature = (items: DataTable[]) => items
    .map(table => `${table.id}:${table.sourceFileName}:${table.rowCount}:${table.columnCount}`)
    .sort()
    .join('|')
  const mappingSignature = (items: DataTable[]) => items
    .flatMap(table => table.columns.map(column => `${table.id}:${column.sourceName}:${column.semanticType ?? ''}:${column.confirmedByUser}`))
    .sort()
    .join('|')
  const hasExistingGenericState = session.tables !== undefined
  const dataChanged = hasExistingGenericState && dataSignature(existingTables) !== dataSignature(tables)
  const mappingsChanged = hasExistingGenericState && mappingSignature(existingTables) !== mappingSignature(tables)
  return {
    ...base,
    ...session,
    files,
    mappings,
    tables,
    relationships: session.relationships ?? [],
    relationshipDiagnostics: session.relationshipDiagnostics ?? [],
    performanceDiagnostics: session.performanceDiagnostics ?? [],
    versions: {
      ...currentVersions,
      data: currentVersions.data + (dataChanged ? 1 : 0),
      mappings: currentVersions.mappings + (mappingsChanged ? 1 : 0),
      analysis: currentVersions.analysis + (dataChanged || mappingsChanged ? 1 : 0),
    },
    duplicateRoleDecisions: session.duplicateRoleDecisions ?? [],
    relationshipDecisions: session.relationshipDecisions ?? [],
  }
}

export const updateSessionRelationship = (
  session: ImportSession,
  relationship: TableRelationship,
): ImportSession => ({
  ...session,
  relationships: [
    ...session.relationships.filter(item => item.id !== relationship.id),
    relationship,
  ],
  tables: session.tables.map(table =>
    table.id === relationship.leftTableId || table.id === relationship.rightTableId
      ? { ...table, dataVersion: table.dataVersion + 1 }
      : table,
  ),
  versions: {
    ...session.versions,
    relationships: session.versions.relationships + 1,
    analysis: session.versions.analysis + 1,
  },
  confirmed: false,
})

export const removeSessionRelationship = (session: ImportSession, relationshipId: string): ImportSession => {
  const relationship = session.relationships.find(item => item.id === relationshipId)
  if (!relationship) return session
  return {
    ...session,
    relationships: session.relationships.filter(item => item.id !== relationshipId),
    tables: session.tables.map(table =>
      table.id === relationship.leftTableId || table.id === relationship.rightTableId
        ? { ...table, dataVersion: table.dataVersion + 1 }
        : table,
    ),
    versions: {
      ...session.versions,
      relationships: session.versions.relationships + 1,
      analysis: session.versions.analysis + 1,
    },
    confirmed: false,
  }
}

export const singleTableTypeLabel: Record<SingleTableType, string> = { behavior: '用户行为单表', order: '订单主表单表', order_items: '订单明细单表', order_wide: '订单宽表', unknown: '待选择' }
export const singleTableTypeDescription: Record<SingleTableType, string> = { behavior: '一张表同时记录用户行为，如 pv、fav、cart、buy。', order: '一行通常代表一笔订单，包含订单金额等订单字段。', order_items: '一行代表一个订单商品，通常包含 order_id、product_id、price、amount。', order_wide: '一张表同时包含订单字段和商品字段，同一 order_id 可能出现多行。', unknown: '暂时无法判断，请根据样例选择一种单表类型。' }

export const standardFieldMigration: Record<string, string> = { amount: 'quantity', category_id: 'category', refund_order_id: 'order_id' }

export const roleLabel: Record<FileRole, string> = {
  behavior: '用户行为明细表',
  orders: '订单主表',
  order_items: '订单商品明细',
  products: '商品表',
  dimension: '维度/字典表',
  categories: '维度/字典表（旧）',
  users: '用户表',
  refunds: '退款表',
  unknown: '未知角色',
}

export const rowGranularityLabel: Record<RowGranularity, string> = {
  behavior: '一次行为',
  order: '一个订单',
  order_item: '一个订单商品',
  product: '一个商品',
  user: '一个用户',
  refund: '一次退款',
  custom: '自定义',
}

export const rowGranularityDescription: Record<RowGranularity, string> = {
  behavior: '每行是一条浏览、收藏、加购或购买行为。',
  order: '每行是一笔订单；同一个 order_id 通常只出现一次。',
  order_item: '每行是订单中的一个商品；同一个 order_id 可以出现多行。',
  product: '每行是一个商品或 SKU 的资料。',
  user: '每行是一个用户的资料。',
  refund: '每行是一条退款记录；同一订单可以出现多次退款。',
  custom: '业务自定义粒度，需要结合字段和样例确认。',
}

export const granularityForRole: Record<FileRole, RowGranularity> = {
  behavior: 'behavior',
  orders: 'order',
  order_items: 'order_item',
  products: 'product',
  dimension: 'custom',
  categories: 'custom',
  users: 'user',
  refunds: 'refund',
  unknown: 'custom',
}

export const recommendedGranularity = (file: ImportedFile, role = roleFromFile(file)): RowGranularity => {
  const headers = file.preview?.headers.map(normalizeField) ?? []
  if (role === 'orders' && headers.includes('order_id') && headers.some(header => ['product_id', 'goods_id', 'sku'].includes(header))) return 'order_item'
  return granularityForRole[role]
}

export const granularityConflict = (role: FileRole, granularity: RowGranularity): string | null => {
  if (granularity === 'custom' || role === 'unknown') return null
  const expected = granularityForRole[role]
  return expected === granularity ? null : `当前角色“${roleLabel[role]}”通常对应“${rowGranularityLabel[expected]}”，但当前选择是“${rowGranularityLabel[granularity]}”。请修改角色或粒度。`
}

export const detectSingleTableType = (file: ImportedFile): SingleTableType => {
  const headers = new Set((file.preview?.headers ?? []).map(normalizeField))
  const name = file.name.toLowerCase()
  const hasBehavior = headers.has('behavior') || headers.has('action') || headers.has('type')
  const hasOrderId = headers.has('order_id')
  const hasOrderAmount = headers.has('order_amount') || headers.has('total_amount')
  const hasProduct = headers.has('product_id') || headers.has('goods_id') || headers.has('sku')
  const hasPrice = headers.has('price') || headers.has('unit_price')
  const hasAmount = headers.has('amount') || headers.has('quantity') || headers.has('qty')
  if (hasBehavior && !hasOrderId) return 'behavior'
  if (hasOrderId && hasProduct && hasPrice && hasAmount) return 'order_wide'
  if (hasOrderId && hasProduct && (hasPrice || hasAmount)) return 'order_items'
  if (hasOrderId && hasOrderAmount && !hasProduct) return 'order'
  if (name.includes('behavior') && hasBehavior) return 'behavior'
  return 'unknown'
}

export const singleTableTypeConflict = (role: FileRole, singleTableType: SingleTableType): string | null => {
  if (role === 'unknown' || ['products', 'dimension', 'categories', 'users', 'refunds'].includes(role)) return null
  if (singleTableType === 'unknown') return '单表类型尚未选择，请先选择一种数据表类型。'
  if (role === 'behavior' && singleTableType !== 'behavior') return '当前角色是用户行为表，但单表类型不是用户行为单表。'
  if (role === 'orders' && !['order', 'order_wide'].includes(singleTableType)) return '当前角色是订单主表，但单表类型不是订单主表单表或订单宽表。'
  if (role === 'order_items' && !['order_items', 'order_wide'].includes(singleTableType)) return '当前角色是订单明细，但单表类型不是订单明细单表或订单宽表。'
  return null
}

export const singleTableTypeForRole = (role: FileRole): SingleTableType => {
  if (role === 'behavior') return 'behavior'
  if (role === 'orders') return 'order'
  if (role === 'order_items') return 'order_items'
  return 'unknown'
}

export const roleFromFile = (file: ImportedFile): FileRole => {
  const headerText = file.preview?.headers.join(' ').toLowerCase() ?? ''
  const name = file.name.toLowerCase()
  if (headerText.includes('behavior') || headerText.includes('行为') || headerText.includes('goods_id')) return 'behavior'
  if ((name.includes('category_labels') || name.includes('category-labels') || name.includes('category_mapping') || name.includes('category-mapping') || name.includes('category_dict') || name.includes('category-dict') || name.includes('类目映射') || name.includes('类目字典')) &&
      (headerText.includes('category_id') || headerText.includes('categoryid') || headerText.includes('category_label') || headerText.includes('category_name'))) return 'dimension'
  if (name.includes('item') || name.includes('detail') || headerText.includes('quantity')) return 'order_items'
  if (name.includes('refund') || headerText.includes('refund')) return 'refunds'
  if (name.includes('product') || headerText.includes('product_name')) return 'products'
  if (name.includes('user') || headerText.includes('register_at')) return 'users'
  if (name.includes('order') || headerText.includes('order_id')) return 'orders'
  return 'unknown'
}

export const duplicateRoleGroups = (mappings: FileMapping[]): DuplicateRoleGroup[] => {
  const groups = new Map<FileRole, string[]>()
  mappings.forEach(mapping => {
    if (mapping.role === 'unknown') return
    const fileIds = groups.get(mapping.role) ?? []
    fileIds.push(mapping.fileId)
    groups.set(mapping.role, fileIds)
  })
  return [...groups.entries()].filter(([, fileIds]) => fileIds.length > 1).map(([role, fileIds]) => ({ role, fileIds }))
}

export const mergeRoleFiles = (files: ImportedFile[], mappings: FileMapping[], role: FileRole): { files: ImportedFile[]; mappings: FileMapping[]; preview?: MergePreview; error?: string } => {
  const roleMappings = mappings.filter(mapping => mapping.role === role)
  const roleFiles = roleMappings.map(mapping => files.find(file => file.id === mapping.fileId)).filter((file): file is ImportedFile => Boolean(file))
  if (roleFiles.length < 2) return { files, mappings }
  const fileInfos = roleFiles.map(f => ({
    name: f.name,
    rows: f.preview?.totalRows ?? f.preview?.rows?.length ?? 0,
    headers: f.preview?.headers ?? [],
  }))
  const allHeaders = [...new Set(fileInfos.flatMap(f => f.headers))]
  const commonHeaders = allHeaders.filter(h => fileInfos.every(f => f.headers.includes(h)))
  const extraHeaders = fileInfos.map(f => ({ file: f.name, headers: f.headers.filter(h => !commonHeaders.includes(h)) })).filter(e => e.headers.length > 0)
  const missingHeaders = fileInfos.map(f => ({ file: f.name, headers: commonHeaders.filter(h => !f.headers.includes(h)) })).filter(e => e.headers.length > 0)
  const totalRows = fileInfos.reduce((sum, f) => sum + f.rows, 0)
  const compatible = missingHeaders.length === 0
  const issue = !compatible ? '部分文件缺少共同表头列，合并后缺失列将填充空值。请确认字段映射是否完整。' : null
  const preview: MergePreview = { role, files: fileInfos, commonHeaders, extraHeaders, missingHeaders, totalRows, compatible, issue }
  const first = roleFiles[0]
  const mergedId = roleFiles.map(file => file.id).sort().join('+')
  const mergedHeaders = ['_source_file', ...commonHeaders]
  const mergedRows = roleFiles.flatMap(file => {
    const rows = file.preview?.allRows ?? file.preview?.rows ?? []
    const hdrs = file.preview?.headers ?? []
    return rows.map(row => {
      const mapped = commonHeaders.map(h => { const idx = hdrs.indexOf(h); return idx >= 0 ? (row[idx] ?? '') : '' })
      return [file.name, ...mapped]
    })
  })
  const mergedPreview = first.preview ? { headers: mergedHeaders, rows: mergedRows.slice(0, 100), allRows: mergedRows, totalRows: mergedRows.length } : undefined
  const mergedFile = { ...first, id: mergedId, name: roleFiles.map(file => file.name).join(' + '), size: roleFiles.reduce((sum, file) => sum + file.size, 0), preview: mergedPreview } as ImportedFile
  const mergedFields: FieldMapping[] = [{ source: '_source_file', canonical: '', confidence: 'low', dimensionType: 'text' }, ...commonHeaders.map(h => { const orig = roleMappings[0]?.fields.find(f => f.source === h); return orig ? { ...orig } : { source: h, canonical: '', confidence: 'low' as const, dimensionType: 'text' as const } })]
  const mergedMapping: FileMapping = { ...roleMappings[0], fileId: mergedId, fields: mergedFields, confirmed: false }
  return { files: [...files.filter(file => !roleFiles.some(item => item.id === file.id)), mergedFile], mappings: [...mappings.filter(mapping => !roleMappings.some(item => item.fileId === mapping.fileId)), mergedMapping], preview }
}

export const buildMergePreview = (files: ImportedFile[], mappings: FileMapping[], role: FileRole): MergePreview | null => {
  const roleMappings = mappings.filter(m => m.role === role)
  if (roleMappings.length < 2) return null
  const roleFiles = roleMappings.map(m => files.find(f => f.id === m.fileId)).filter((f): f is ImportedFile => Boolean(f))
  const fileInfos = roleFiles.map(f => ({ name: f.name, rows: f.preview?.totalRows ?? f.preview?.rows?.length ?? 0, headers: f.preview?.headers ?? [] }))
  const allHeaders = [...new Set(fileInfos.flatMap(f => f.headers))]
  const commonHeaders = allHeaders.filter(h => fileInfos.every(f => f.headers.includes(h)))
  const extraHeaders = fileInfos.map(f => ({ file: f.name, headers: f.headers.filter(h => !commonHeaders.includes(h)) })).filter(e => e.headers.length > 0)
  const missingHeaders = fileInfos.map(f => ({ file: f.name, headers: commonHeaders.filter(h => !f.headers.includes(h)) })).filter(e => e.headers.length > 0)
  const totalRows = fileInfos.reduce((sum, f) => sum + f.rows, 0)
  const compatible = missingHeaders.length === 0
  const issue = !compatible ? '部分文件缺少共同表头列，合并后缺失列将填充空值。' : null
  return { role, files: fileInfos, commonHeaders, extraHeaders, missingHeaders, totalRows, compatible, issue }
}

export const mappingsForFile = (file: ImportedFile): FileMapping => ({
  fileId: file.id,
  role: roleFromFile(file),
  singleTableType: detectSingleTableType(file),
  granularity: recommendedGranularity(file),
  fields: (file.preview?.headers ?? []).map(source => { const canonical = recommendedCanonical(source); return { source, canonical, confidence: confidenceForField(source), reason: recognitionReason(source, canonical), dimensionType: canonical ? undefined : detectFieldDimensionType(file, source) } }),
  behaviorValueMappings: {},
  confirmed: false,
})

const fieldAliases: Record<string, string[]> = {
  user_id: ['user_id', 'userid', '用户id', '用户编号'],
  product_id: ['product_id', 'goods_id', '商品id', '商品编号', 'sku'],
  order_id: ['order_id', '订单id', '订单编号'],
  behavior: ['behavior', '行为', '动作', 'type'],
  datetime: ['datetime', 'date', 'time', 'created_at', '下单时间', '时间'],
  price: ['price', 'unit_price', '商品价格', '单价'],
  quantity: ['quantity', 'qty', 'amount', '数量', '件数'],
  sales_amount: ['sales_amount', 'sales', '销售额', '销售金额'],
  order_amount: ['order_amount', 'total_amount', '订单金额', '成交金额', '实付金额'],
  product_name: ['product_name', 'goods_name', '商品名', '商品名称'],
  category_id: ['category_id', 'categoryid', 'category', '类目id', '类目编号', '分类id'],
  category_name: ['category_name', 'category_label', 'categoryname', '类目名称', '类目名', '分类名称', '分类名', '品类名称'],
  channel: ['channel', 'source', '渠道', '来源'],
  refund_amount: ['refund_amount', '退款金额'],
  refund_at: ['refund_at', '退款时间'],
  address: ['address', '地址', '收货地址'],
  sex: ['sex', 'gender', '性别'],
  device: ['device', 'device_type', '设备', '设备类型'],
  province: ['province', '省', '省份'],
  city: ['city', '市', '城市'],
  occupation: ['occupation', 'job', 'job_title', '职业', '职位'],
  user_segment: ['user_segment', 'segment', '会员等级', '用户分群', '客户类型'],
}

const normalizeField = (value: string) => value.trim().toLowerCase().replace(/[\s-]/g, '_')
export const recommendedCanonical = (source: string) => {
  const normalized = normalizeField(source)
  if (['category_label', 'category_name', 'categoryname', 'label'].includes(normalized)) return 'category_label'
  if (['category_id', 'categoryid'].includes(normalized)) return 'category_id'
  return Object.entries(fieldAliases).find(([, aliases]) => aliases.some(alias => normalizeField(alias) === normalized))?.[0] ?? ''
}
export const recognitionReason = (source: string, canonical = recommendedCanonical(source)) => !canonical ? 'unrecognized field; ignored by default' : normalizeField(source) === 'amount' ? 'amount may mean money or quantity; mapped to quantity with medium confidence' : 'matched a supported field alias'
export const confidenceForField = (source: string): FieldMapping['confidence'] => !recommendedCanonical(source) ? 'low' : normalizeField(source) === 'amount' ? 'medium' : 'high'

const numericPattern = /^[+-]?\d+(\.\d+)?$/
const dateValue = (value: string) => {
  const trimmed = value.replace(/[,\u00a5$￥]/g, '').trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  if (!Number.isNaN(num)) return 'numeric'
  const ts = Date.parse(trimmed)
  if (!Number.isNaN(ts)) return 'date'
  return 'text'
}
export const detectFieldDimensionType = (file: ImportedFile | undefined, source: string): DimensionType => {
  if (!file?.preview) return 'text'
  const index = file.preview.headers.indexOf(source)
  if (index < 0) return 'text'
  const rows = file.preview.allRows ?? file.preview.rows
  const values = rows.map(row => (row[index] ?? '').trim()).filter(Boolean)
  if (values.length === 0) return 'text'
  const types = new Set(values.map(v => dateValue(v)).filter(Boolean))
  if (types.size === 1) {
    const only = [...types][0]
    if (only === 'numeric') return 'numeric'
    if (only === 'date') return 'date'
  }
  return 'text'
}

export const duplicateCanonicalMappings = (mapping: FileMapping | undefined): DuplicateCanonicalMapping[] => {
  const sourcesByCanonical = new Map<string, string[]>()
  ;(mapping?.fields ?? []).forEach(field => {
    if (!field.canonical) return
    const sources = sourcesByCanonical.get(field.canonical) ?? []
    sources.push(field.source)
    sourcesByCanonical.set(field.canonical, sources)
  })
  return [...sourcesByCanonical.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([canonical, sources]) => ({ canonical, sources }))
}

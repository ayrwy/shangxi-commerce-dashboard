import type { DataColumn, DataTable, FileMapping, ImportedFile, ImportSession, RelationshipDiagnostic, RelationshipDiagnosticCode, RelationshipEvidence, TableRelationship } from './importSession'

export type DiscoveredRelationship = TableRelationship & {
  evidence: RelationshipEvidence
  diagnostics: RelationshipDiagnostic[]
}

export type RelationshipDiscoveryOptions = {
  sampleSize?: number
  minimumSampleOverlap?: number
  minimumCandidateConfidence?: number
  lowMatchRateThreshold?: number
  approximateUniquenessThreshold?: number
}

export type RelationshipDiscoveryResult = {
  relationships: DiscoveredRelationship[]
  diagnostics: RelationshipDiagnostic[]
}

const defaultDiscoveryOptions: Required<RelationshipDiscoveryOptions> = {
  sampleSize: 200,
  minimumSampleOverlap: 0.1,
  minimumCandidateConfidence: 0.45,
  lowMatchRateThreshold: 0.6,
  approximateUniquenessThreshold: 0.98,
}

const discoveryCache = new Map<string, RelationshipDiscoveryResult>()

const discoveryCacheKey = (tables: DataTable[], options: Required<RelationshipDiscoveryOptions>) => JSON.stringify({
  tables: tables.map(table => ({ id: table.id, version: table.dataVersion, rows: table.rowCount, columns: table.columns.map(column => [column.sourceName, column.semanticType, column.analysisRole]) })),
  options,
})

const normalizeName = (value: string) => value
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase()
  .replace(/[\s-]+/g, '_')
  .replace(/^dim_|^fact_|_key$/g, '')

// Collapse common identifier suffixes so category_id/categoryid and other
// dimension keys can be matched without table-role-specific rules.
const keyFamily = (value: string) => normalizeName(value)
  .replace(/(?:^|_)(id|code|key|number|no)$/g, '')
  .replace(/(id|code|key|number|no)$/g, '')
  .replace(/_/g, '')

const normalizeJoinValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

const isKeyLike = (column: DataColumn) => {
  const name = normalizeName(column.semanticType || column.sourceName)
  if (/(?:id|code|key|number|no)$/.test(name)) return true
  return column.analysisRole === 'identifier' || /(^|_)(id|code|key|number|no|编号|编码)$/.test(name)
}

const semanticName = (column: DataColumn) => normalizeName(column.semanticType || column.sourceName)

const tokenSimilarity = (left: string, right: string) => {
  if (left === right) return 1
  const leftTokens = new Set(left.split('_').filter(Boolean))
  const rightTokens = new Set(right.split('_').filter(Boolean))
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) return 0
  return [...leftTokens].filter(token => rightTokens.has(token)).length / union.size
}

const typeCompatibility = (left: DataColumn, right: DataColumn) => {
  if (left.dataType === 'unknown' || right.dataType === 'unknown') return 0.6
  if (left.dataType === right.dataType) return 1
  if (['string', 'number'].includes(left.dataType) && ['string', 'number'].includes(right.dataType)) return 0.85
  return 0
}

const columnValues = (table: DataTable, field: string) => table.rows
  .map(row => normalizeJoinValue(row[field]))

const sampleDistinct = (values: Array<string | null>, sampleSize: number) => {
  const sampled = new Set<string>()
  for (const value of values) {
    if (value !== null) sampled.add(value)
    if (sampled.size >= sampleSize) break
  }
  return sampled
}

const displayFieldFor = (table: DataTable, key: DataColumn) => table.columns.find(column => {
  if (column.sourceName === key.sourceName || column.analysisRole === 'measure' || column.analysisRole === 'time') return false
  const name = normalizeName(column.semanticType || column.sourceName)
  return /(^|_)(name|label|title|level|description|名称|名字|等级)$/.test(name)
})?.sourceName

const relationshipId = (leftTable: DataTable, left: DataColumn, rightTable: DataTable, right: DataColumn) =>
  `${leftTable.id}:${left.sourceName}->${rightTable.id}:${right.sourceName}`

const analyzeCandidate = (
  leftTable: DataTable,
  left: DataColumn,
  rightTable: DataTable,
  right: DataColumn,
  options: Required<RelationshipDiscoveryOptions>,
  forceCandidate = false,
): DiscoveredRelationship | null => {
  const semanticSimilarity = left.semanticType && right.semanticType
    ? tokenSimilarity(normalizeName(left.semanticType), normalizeName(right.semanticType))
    : 0
  const leftName = normalizeName(left.sourceName)
  const rightName = normalizeName(right.sourceName)
  const nameSimilarity = Math.max(
    tokenSimilarity(leftName, rightName),
    keyFamily(leftName) && keyFamily(leftName) === keyFamily(rightName) ? 1 : 0,
  )
  const compatible = typeCompatibility(left, right)
  if (!forceCandidate && (Math.max(semanticSimilarity, nameSimilarity) < 0.5 || compatible === 0)) return null

  const leftValues = columnValues(leftTable, left.sourceName)
  const rightValues = columnValues(rightTable, right.sourceName)
  const leftSample = sampleDistinct(leftValues, options.sampleSize)
  const rightSample = sampleDistinct(rightValues, options.sampleSize)
  const sampleMatches = [...leftSample].filter(value => rightSample.has(value)).length
  const sampleOverlap = leftSample.size > 0 ? sampleMatches / leftSample.size : 0
  if (!forceCandidate && sampleOverlap < options.minimumSampleOverlap) return null

  const leftNonEmpty = leftValues.filter((value): value is string => value !== null)
  const rightNonEmpty = rightValues.filter((value): value is string => value !== null)
  const leftSet = new Set(leftNonEmpty)
  const rightSet = new Set(rightNonEmpty)
  const matchedDistinct = [...leftSet].filter(value => rightSet.has(value))
  const matchRate = leftSet.size > 0 ? matchedDistinct.length / leftSet.size : 0
  const rightKeyUniqueness = rightNonEmpty.length > 0 ? rightSet.size / rightNonEmpty.length : 0
  const leftUniqueness = leftNonEmpty.length > 0 ? leftSet.size / leftNonEmpty.length : 0
  const displayField = displayFieldFor(rightTable, right)
  const confidence = Math.max(0, Math.min(1,
    semanticSimilarity * 0.25 +
    nameSimilarity * 0.15 +
    compatible * 0.15 +
    matchRate * 0.25 +
    rightKeyUniqueness * 0.15 +
    (displayField ? 0.05 : 0),
  ))
  if (!forceCandidate && confidence < options.minimumCandidateConfidence) return null

  const id = relationshipId(leftTable, left, rightTable, right)
  const diagnostics: RelationshipDiagnostic[] = []
  const pushDiagnostic = (code: RelationshipDiagnosticCode, severity: RelationshipDiagnostic['severity'], message: string, samples: string[] = []) => {
    diagnostics.push({ code, severity, relationshipId: id, message, samples })
  }
  if (matchRate < options.lowMatchRateThreshold) {
    pushDiagnostic('low-match-rate', 'warning', `匹配率仅为 ${(matchRate * 100).toFixed(1)}%，不能自动启用。`, [...leftSet].filter(value => !rightSet.has(value)).slice(0, 5))
  }
  if (rightKeyUniqueness < options.approximateUniquenessThreshold) {
    pushDiagnostic('duplicate-right-key', 'blocking', `右表连接键唯一率为 ${(rightKeyUniqueness * 100).toFixed(1)}%，不满足维度映射要求。`)
  }
  if (leftUniqueness < 1 && rightKeyUniqueness < options.approximateUniquenessThreshold) {
    pushDiagnostic('many-to-many', 'blocking', '两侧连接键均有重复值，存在多对多和数据膨胀风险。')
  }
  const leftEmptyCount = leftValues.filter(value => value === null).length
  const rightEmptyCount = rightValues.filter(value => value === null).length
  if (leftEmptyCount > 0 || rightEmptyCount > 0) {
    pushDiagnostic('empty-key', 'warning', `连接键包含空值：左表 ${leftEmptyCount} 个，右表 ${rightEmptyCount} 个。`)
  }
  if (displayField) {
    const labelsByKey = new Map<string, Set<string>>()
    rightTable.rows.forEach(row => {
      const key = normalizeJoinValue(row[right.sourceName])
      const label = normalizeJoinValue(row[displayField])
      if (!key || !label) return
      const labels = labelsByKey.get(key) ?? new Set<string>()
      labels.add(label)
      labelsByKey.set(key, labels)
    })
    const conflicts = [...labelsByKey.entries()].filter(([, labels]) => labels.size > 1).map(([key]) => key)
    if (conflicts.length > 0) {
      pushDiagnostic('conflicting-right-label', 'blocking', '右表同一连接键对应多个展示名称，禁止用于名称映射。', conflicts.slice(0, 5))
    }
  }
  return {
    id,
    leftTableId: leftTable.id,
    leftField: left.sourceName,
    rightTableId: rightTable.id,
    rightField: right.sourceName,
    cardinality: leftUniqueness === 1 ? 'one-to-one' : 'many-to-one',
    displayField,
    matchRate,
    rightKeyUniqueness,
    confidence,
    source: 'auto',
    status: 'suggested',
    evidence: {
      semanticSimilarity,
      nameSimilarity,
      typeCompatibility: compatible,
      valueOverlap: matchRate,
      rightKeyUniqueness,
      rightHasDisplayField: Boolean(displayField),
      leftDistinctCount: leftSet.size,
      rightDistinctCount: rightSet.size,
      matchedDistinctCount: matchedDistinct.length,
      unmatchedLeftCount: leftSet.size - matchedDistinct.length,
      leftEmptyCount,
      rightEmptyCount,
      unmatchedLeftSamples: [...leftSet].filter(value => !rightSet.has(value)).slice(0, 5),
    },
    diagnostics,
  }
}

export type ManualRelationshipInput = {
  id?: string
  leftTableId: string
  leftField: string
  rightTableId: string
  rightField: string
  displayField?: string
}

export const evaluateManualRelationship = (
  tables: DataTable[],
  input: ManualRelationshipInput,
  discoveryOptions: RelationshipDiscoveryOptions = {},
): DiscoveredRelationship | null => {
  const leftTable = tables.find(table => table.id === input.leftTableId)
  const rightTable = tables.find(table => table.id === input.rightTableId)
  const left = leftTable?.columns.find(column => column.sourceName === input.leftField)
  const right = rightTable?.columns.find(column => column.sourceName === input.rightField)
  if (!leftTable || !rightTable || leftTable.id === rightTable.id || !left || !right) return null
  const candidate = analyzeCandidate(
    leftTable,
    left,
    rightTable,
    right,
    { ...defaultDiscoveryOptions, ...discoveryOptions },
    true,
  )
  if (!candidate) return null
  return {
    ...candidate,
    id: input.id ?? candidate.id,
    displayField: input.displayField || candidate.displayField,
    source: 'manual',
    status: 'suggested',
  }
}

export const discoverTableRelationships = (
  tables: DataTable[],
  discoveryOptions: RelationshipDiscoveryOptions = {},
): RelationshipDiscoveryResult => {
  const options = { ...defaultDiscoveryOptions, ...discoveryOptions }
  const cacheKey = discoveryCacheKey(tables, options)
  const cached = discoveryCache.get(cacheKey)
  if (cached) return cached
  const relationships: DiscoveredRelationship[] = []
  for (const leftTable of tables) {
    for (const rightTable of tables) {
      if (leftTable.id === rightTable.id) continue
      for (const left of leftTable.columns.filter(isKeyLike)) {
        for (const right of rightTable.columns.filter(isKeyLike)) {
          const candidate = analyzeCandidate(leftTable, left, rightTable, right, options)
          if (candidate) relationships.push(candidate)
        }
      }
    }
  }

  const bestDirectionByPair = new Map<string, DiscoveredRelationship>()
  relationships.forEach(candidate => {
    const endpoints = [
      `${candidate.leftTableId}:${candidate.leftField}`,
      `${candidate.rightTableId}:${candidate.rightField}`,
    ].sort()
    const pairKey = endpoints.join('|')
    const current = bestDirectionByPair.get(pairKey)
    const directionScore = (relationship: DiscoveredRelationship) => {
      const left = tables.find(table => table.id === relationship.leftTableId)
      const right = tables.find(table => table.id === relationship.rightTableId)
      const classificationPrior = left?.classification === 'fact' && right?.classification === 'dimension'
        ? 1
        : right?.classification === 'dimension'
          ? 0.7
          : 0
      return relationship.rightKeyUniqueness * 0.45 + relationship.confidence * 0.25 + classificationPrior * 0.3
    }
    const candidateScore = directionScore(candidate)
    const currentScore = current ? directionScore(current) : -1
    if (!current || candidateScore > currentScore) bestDirectionByPair.set(pairKey, candidate)
  })
  const directed = [...bestDirectionByPair.values()]
  const candidatesBySource = new Map<string, DiscoveredRelationship[]>()
  directed.forEach(candidate => {
    const key = `${candidate.leftTableId}:${candidate.leftField}`
    const group = candidatesBySource.get(key) ?? []
    group.push(candidate)
    candidatesBySource.set(key, group)
  })
  candidatesBySource.forEach(group => {
    if (group.length < 2) return
    group.forEach(candidate => candidate.diagnostics.push({
      code: 'ambiguous-target',
      severity: 'warning',
      relationshipId: candidate.id,
      message: '同一来源字段存在多个候选维度表，需要用户选择主要关系。',
      samples: group.map(item => item.rightTableId),
    }))
  })
  directed.sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id))
  const result = { relationships: directed, diagnostics: directed.flatMap(candidate => candidate.diagnostics) }
  discoveryCache.set(cacheKey, result)
  if (discoveryCache.size > 8) discoveryCache.delete(discoveryCache.keys().next().value!)
  return result
}

const relationshipSignature = (relationship: TableRelationship) => JSON.stringify({
  id: relationship.id,
  cardinality: relationship.cardinality,
  displayField: relationship.displayField,
  matchRate: relationship.matchRate,
  rightKeyUniqueness: relationship.rightKeyUniqueness,
  confidence: relationship.confidence,
  source: relationship.source,
  status: relationship.status,
  evidence: relationship.evidence,
})

export const synchronizeDiscoveredRelationships = (session: ImportSession): ImportSession => {
  const discovery = discoverTableRelationships(session.tables)
  return applyRelationshipDiscovery(session, discovery)
}

export const applyRelationshipDiscovery = (session: ImportSession, discovery: RelationshipDiscoveryResult): ImportSession => {
  const existingById = new Map(session.relationships.map(relationship => [relationship.id, relationship]))
  const discovered = discovery.relationships.map(candidate => {
    const { diagnostics: _diagnostics, ...relationship } = candidate
    const existing = existingById.get(candidate.id)
    return {
      ...relationship,
      status: existing?.status ?? relationship.status,
      source: existing?.source ?? relationship.source,
      displayField: existing?.displayField ?? relationship.displayField,
    } satisfies TableRelationship
  })
  const discoveredIds = new Set(discovered.map(relationship => relationship.id))
  const preserved = session.relationships.filter(relationship =>
    (relationship.source === 'manual' && !discoveredIds.has(relationship.id)) ||
    (relationship.status !== 'suggested' && !discoveredIds.has(relationship.id)),
  )
  const relationships = [...preserved, ...discovered]
  const previousSignature = session.relationships.map(relationshipSignature).sort().join('|')
  const nextSignature = relationships.map(relationshipSignature).sort().join('|')
  const previousDiagnostics = JSON.stringify(session.relationshipDiagnostics)
  const nextDiagnostics = JSON.stringify(discovery.diagnostics)
  if (previousSignature === nextSignature && previousDiagnostics === nextDiagnostics) return session
  return {
    ...session,
    relationships,
    relationshipDiagnostics: discovery.diagnostics,
    versions: {
      ...session.versions,
      relationships: session.versions.relationships + 1,
      analysis: session.versions.analysis + 1,
    },
    confirmed: false,
  }
}

export type RelationshipCardinality = '1:1' | '1:n' | 'n:1' | 'n:m' | 'unknown'

export type EnhancedRelationshipCheck = {
  key: string
  label: string
  leftTableName: string
  rightTableName: string
  leftField: string
  rightField: string
  matched: number
  totalLeft: number
  totalRight: number
  available: boolean
  message: string
  cardinality: RelationshipCardinality
  matchRate: number
  unmatchedLeftSamples: string[]
  unmatchedRightSamples: string[]
  leftHasEmpty: boolean
  rightHasEmpty: boolean
  leftEmptyCount: number
  rightEmptyCount: number
  leftIsUnique: boolean
  rightIsUnique: boolean
  impactMetrics: string[]
  candidateKeyFields: string[]
  compositeKeySuggested: boolean
}

const columnValuesRaw = (file: ImportedFile | undefined, mapping: FileMapping | undefined, canonical: string): { values: string[]; emptyCount: number } => {
  if (!file?.preview || !mapping) return { values: [], emptyCount: 0 }
  const source = mapping.fields.find(f => f.canonical === canonical)?.source
  if (!source) return { values: [], emptyCount: 0 }
  const index = file.preview.headers.indexOf(source)
  if (index < 0) return { values: [], emptyCount: 0 }
  const rows = file.preview.allRows ?? file.preview.rows
  let emptyCount = 0
  const values = rows.map(row => {
    const v = (row[index] ?? '').trim()
    if (!v) emptyCount++
    return v
  }).filter(Boolean)
  return { values, emptyCount }
}

const detectCardinality = (leftValues: string[], rightValues: string[]): RelationshipCardinality => {
  const leftUnique = new Set(leftValues)
  const rightUnique = new Set(rightValues)
  const leftCount = leftUnique.size
  const rightCount = rightUnique.size
  const leftTotal = leftValues.length
  const rightTotal = rightValues.length
  if (leftTotal === 0 || rightTotal === 0) return 'unknown'
  const leftHasDuplicate = leftTotal > leftCount
  const rightHasDuplicate = rightTotal > rightCount
  if (!leftHasDuplicate && !rightHasDuplicate) return '1:1'
  if (!leftHasDuplicate && rightHasDuplicate) return '1:n'
  if (leftHasDuplicate && !rightHasDuplicate) return 'n:1'
  return 'n:m'
}

const metricImpactMap: Record<string, string[]> = {
  'orders-items': ['订单量', 'GMV', '客单价', '明细销售额', '商品排行'],
  'orders-users': ['购买用户数', '复购率'],
  'items-products': ['商品排行', '商品销量', '商品销售额'],
  'refunds-orders': ['退款金额', '退款率'],
}
const compositeKeyFields = ['platform', 'store_id', 'shop_id', 'tenant_id']

const mappedFields = (mapping: FileMapping | undefined) => new Set((mapping?.fields ?? []).map(field => field.canonical).filter(Boolean))

const sampling = (allValues: string[], knownValues: Set<string>, max = 5): string[] => {
  const unmatched = [...new Set(allValues)].filter(v => !knownValues.has(v))
  return unmatched.slice(0, max)
}

export type BuildEnhancedRelationshipsResult = {
  relationships: EnhancedRelationshipCheck[]
  blockingCardinalityIssues: string[]
  warningCardinalityIssues: string[]
  qualityIssues: string[]
}

export const buildEnhancedRelationships = (
  files: ImportedFile[],
  mappings: FileMapping[],
): BuildEnhancedRelationshipsResult => {
  const fileFor = (mapping: FileMapping | undefined) => files.find(f => f.id === mapping?.fileId)
  const nameFor = (mapping: FileMapping | undefined) => fileFor(mapping)?.name ?? mapping?.fileId ?? '?'

  const orders = mappings.find(m => m.role === 'orders')
  const items = mappings.find(m => m.role === 'order_items')
  const products = mappings.find(m => m.role === 'products')
  const users = mappings.find(m => m.role === 'users')
  const refunds = mappings.find(m => m.role === 'refunds')

  const relDefs: { key: string; label: string; left: { mapping: FileMapping | undefined; canonical: string }; right: { mapping: FileMapping | undefined; canonical: string }; leftName: string; rightName: string }[] = [
    { key: 'orders-items', label: '订单 → 明细', left: { mapping: orders, canonical: 'order_id' }, right: { mapping: items, canonical: 'order_id' }, leftName: nameFor(orders), rightName: nameFor(items) },
    { key: 'orders-users', label: '订单 → 用户', left: { mapping: orders, canonical: 'user_id' }, right: { mapping: users, canonical: 'user_id' }, leftName: nameFor(orders), rightName: nameFor(users) },
    { key: 'items-products', label: '明细 → 商品', left: { mapping: items, canonical: 'product_id' }, right: { mapping: products, canonical: 'product_id' }, leftName: nameFor(items), rightName: nameFor(products) },
    { key: 'refunds-orders', label: '退款 → 订单', left: { mapping: refunds, canonical: 'order_id' }, right: { mapping: orders, canonical: 'order_id' }, leftName: nameFor(refunds), rightName: nameFor(orders) },
  ]

  const relationships: EnhancedRelationshipCheck[] = []
  const blockingCardinalityIssues: string[] = []
  const warningCardinalityIssues: string[] = []
  const qualityIssues: string[] = []

  relDefs.forEach(def => {
    if (!def.left.mapping && !def.right.mapping) return
    const { values: leftValues, emptyCount: leftEmpty } = columnValuesRaw(fileFor(def.left.mapping), def.left.mapping, def.left.canonical)
    const { values: rightValues, emptyCount: rightEmpty } = columnValuesRaw(fileFor(def.right.mapping), def.right.mapping, def.right.canonical)
    if (leftValues.length === 0 && rightValues.length === 0) return

    const rightSet = new Set(rightValues)
    const leftSet = new Set(leftValues)
    const uniqueLeft = [...leftSet]
    const matched = uniqueLeft.filter(v => rightSet.has(v)).length
    const total = uniqueLeft.length
    const matchRate = total > 0 ? matched / total : 0
    const cardinality = detectCardinality(leftValues, rightValues)

    const unmatchedLeftSamples = sampling(leftValues, rightSet)
    const unmatchedRightSamples = sampling(rightValues, leftSet)
    const leftIsUnique = leftValues.length === leftSet.size
    const rightIsUnique = rightValues.length === rightSet.size

    const impactMetrics = metricImpactMap[def.key] ?? []
    const sharedCompositeFields = compositeKeyFields.filter(field => mappedFields(def.left.mapping).has(field) && mappedFields(def.right.mapping).has(field))

    const available = total > 0 && matched === total
    const message = total === 0
      ? '缺少关联键值'
      : !available
      ? `已匹配 ${matched}/${total} 个（${(matchRate * 100).toFixed(0)}%）`
      : `全部匹配（${total} 个）`

    relationships.push({
      key: def.key,
      label: def.label,
      leftTableName: def.leftName,
      rightTableName: def.rightName,
      leftField: def.left.canonical,
      rightField: def.right.canonical,
      matched,
      totalLeft: leftValues.length,
      totalRight: rightValues.length,
      available,
      message,
      cardinality,
      matchRate,
      unmatchedLeftSamples,
      unmatchedRightSamples,
      leftHasEmpty: leftEmpty > 0,
      rightHasEmpty: rightEmpty > 0,
      leftEmptyCount: leftEmpty,
      rightEmptyCount: rightEmpty,
      leftIsUnique,
      rightIsUnique,
      impactMetrics,
      candidateKeyFields: sharedCompositeFields,
      compositeKeySuggested: sharedCompositeFields.length > 0,
    })

    if (cardinality === 'n:m') {
      blockingCardinalityIssues.push(`${def.label}：检测到多对多关系（左 ${leftValues.length} 行/${leftSet.size} 唯一值，右 ${rightValues.length} 行/${rightSet.size} 唯一值），请确认是否允许。`)
    } else if (cardinality === '1:n' || cardinality === 'n:1') {
      if ((cardinality === '1:n' && !leftIsUnique) || (cardinality === 'n:1' && !rightIsUnique)) {
        warningCardinalityIssues.push(`${def.label}：声明 ${cardinality} 但"一端"字段存在重复值，请检查。`)
      }
    }

    if (matchRate < 1 && total > 0) {
      const pct = (matchRate * 100).toFixed(0)
      qualityIssues.push(`${def.label}：匹配率 ${pct}%（${matched}/${total}），影响 ${impactMetrics.join('、')}。`)
      if (unmatchedLeftSamples.length > 0) {
        qualityIssues.push(`${def.label}：左侧未匹配示例：${unmatchedLeftSamples.join('、')}`)
      }
      if (unmatchedRightSamples.length > 0) {
        qualityIssues.push(`${def.label}：右侧未匹配示例：${unmatchedRightSamples.join('、')}`)
      }
    }
    if (leftEmpty > 0 || rightEmpty > 0) {
      qualityIssues.push(`${def.label}：存在空键（左 ${leftEmpty} 个，右 ${rightEmpty} 个）。`)
    }
    if (sharedCompositeFields.length > 0) {
      qualityIssues.push(`${def.label}：发现平台/店铺等复合键字段（${sharedCompositeFields.join('、')}），当前仅按 ${def.left.canonical} 生成候选，确认前请检查是否需要联合匹配。`)
    }
  })

  return { relationships, blockingCardinalityIssues, warningCardinalityIssues, qualityIssues }
}

import { detectSingleTableType, emptyImportSession, granularityForRole, normalizeImportSession, recommendedGranularity, standardFieldMigration, type ImportSession } from './importSession'

const STORAGE_KEY = 'shangxi-dashboard:import-session:v1'

export const loadImportSession = (): ImportSession => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('empty')
    const parsed = JSON.parse(raw) as Partial<ImportSession>
    const files = (parsed.files ?? []).map(file => ({ ...file, file: new File([], file.name, { type: 'text/csv', lastModified: file.lastModified }) }))
    const mappings = (parsed.mappings ?? []).map(mapping => { const file = files.find(item => item.id === mapping.fileId); const fields = mapping.fields.map(field => ({ ...field, canonical: standardFieldMigration[field.canonical] ?? field.canonical })); return { ...mapping, fields, singleTableType: mapping.singleTableType ?? (file ? detectSingleTableType(file) : 'unknown'), behaviorValueMappings: mapping.behaviorValueMappings ?? {}, granularity: mapping.granularity ?? (file ? recommendedGranularity(file, mapping.role) : granularityForRole[mapping.role]) } })
    return normalizeImportSession({ ...parsed, files, mappings, confirmed: Boolean(parsed.confirmed) && mappings.every(mapping => Boolean(mapping.granularity)) })
  } catch {
    return emptyImportSession()
  }
}

export const saveImportSession = (session: ImportSession) => {
  const normalized = normalizeImportSession(session)
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be unavailable or full; the in-memory session remains usable.
  }
  window.dispatchEvent(new CustomEvent('shangxi:session-updated', { detail: normalized }))
}

export const clearStoredImportSession = () => {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* no-op */ }
}

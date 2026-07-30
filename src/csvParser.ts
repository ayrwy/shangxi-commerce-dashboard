import type { CsvPreview } from './importSession'

type ParseOptions = { previewRows?: number; retainAllRows?: boolean }
export type CsvParser = { push: (chunk: string) => void; finish: () => CsvPreview }

const delimiters: CsvPreview['delimiter'][] = [',', ';', '\t']
const countDelimiter = (line: string, delimiter: string) => {
  let count = 0; let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') { if (quoted && line[i + 1] === '"') i += 1; else quoted = !quoted }
    else if (!quoted && c === delimiter) count += 1
  }
  return count
}

export const detectDelimiter = (text: string): CsvPreview['delimiter'] => {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? ''
  return delimiters.reduce((best, d) => countDelimiter(firstLine, d) > countDelimiter(firstLine, best) ? d : best, ',')
}

export const createCsvParser = (options: ParseOptions = {}): CsvParser => {
  const previewLimit = options.previewRows ?? 5
  const retainAllRows = options.retainAllRows !== false
  let delimiter: CsvPreview['delimiter'] | undefined
  let pending = ''
  let row: string[] = []; let field = ''; let quoted = false; let rowNumber = 1
  let headers: string[] = []; const rows: string[][] = []; const preview: string[][] = []
  const warnings: string[] = []; const errors: string[] = []
  const emitRow = () => {
    row.push(field); field = ''
    if (row.some(value => value.length > 0)) {
      if (!headers.length) headers = row.map(header => header.trim())
      else {
        if (row.length !== headers.length) warnings.push(`第 ${rowNumber} 行有 ${row.length} 列，表头有 ${headers.length} 列`)
        if (preview.length < previewLimit) preview.push(row.slice())
        if (retainAllRows) rows.push(row.slice())
      }
    }
    row = []; rowNumber += 1
  }
  const push = (chunk: string) => {
    pending += chunk.replace(/^\uFEFF/, '')
    if (!delimiter) {
      const m = pending.match(/\r\n|\n|\r/)
      if (!m && pending.length < 65536) return
      delimiter = detectDelimiter(pending)
    }
    const d = delimiter
    for (let i = 0; i < pending.length; i += 1) {
      const c = pending[i]
      if (c === '"') { if (quoted && pending[i + 1] === '"') { field += '"'; i += 1 } else quoted = !quoted }
      else if (!quoted && c === d) field += '\0' // replaced below to avoid branch allocation
      else if (!quoted && (c === '\n' || c === '\r')) {
        if (field.includes('\0')) { const parts = field.split('\0'); field = parts.pop() ?? ''; row.push(...parts) }
        if (c === '\r' && pending[i + 1] === '\n') i += 1
        emitRow()
      } else field += c
    }
    // Keep only incomplete record; delimiters are represented by a sentinel.
    pending = ''
    if (field.includes('\0')) { const parts = field.split('\0'); field = parts.pop() ?? ''; row.push(...parts) }
  }
  const finish = (): CsvPreview => {
    if (!delimiter && pending) delimiter = detectDelimiter(pending)
    if (pending) { const tail = pending; pending = ''; push(tail) }
    if (quoted) errors.push(`第 ${rowNumber} 行引号未闭合`)
    if (quoted || field.length > 0 || row.length > 0) emitRow()
    if (!headers.length) errors.push('文件为空或没有有效内容')
    if (headers.some(header => !header.trim())) warnings.push('表头包含空字段名')
    return { headers, rows: preview, ...(retainAllRows ? { allRows: rows } : {}), totalRows: retainAllRows ? rows.length : Math.max(0, rowNumber - 2), delimiter: delimiter ?? ',', encoding: 'utf-8', parseWarnings: [...new Set(warnings)], parseErrors: [...new Set(errors)] }
  }
  return { push, finish }
}

export const parseCsv = (text: string, options: ParseOptions = {}): CsvPreview => {
  const parser = createCsvParser(options); parser.push(text); return parser.finish()
}

import type { CsvPreview } from '../importSession'

const delimiterLabel: Record<CsvPreview['delimiter'], string> = { ',': '逗号 (,)', ';': '分号 (;)', '\t': 'Tab (\\t)' }

export default function CsvPreviewPanel({ preview }: { preview: CsvPreview }) {
  return <div className="csv-preview">
    <div className="preview-meta"><span><b>{preview.totalRows}</b> 行</span><span><b>{preview.headers.length}</b> 列</span><span>分隔符 <b>{delimiterLabel[preview.delimiter]}</b></span><span>编码 <b>{preview.encoding.toUpperCase()}</b></span></div>
    {preview.parseErrors.length > 0 && <div className="preview-alert error"><strong>解析错误</strong>{preview.parseErrors.map(error => <span key={error}>{error}</span>)}</div>}
    {preview.parseWarnings.length > 0 && <div className="preview-alert warning"><strong>解析警告</strong>{preview.parseWarnings.map(warning => <span key={warning}>{warning}</span>)}</div>}
    {preview.headers.length > 0 && <div className="preview-table-wrap"><table className="preview-table"><thead><tr>{preview.headers.map((header, index) => <th key={`${header}-${index}`}>{header || `未命名列 ${index + 1}`}</th>)}</tr></thead><tbody>{preview.rows.map((row, rowIndex) => <tr key={rowIndex}>{preview.headers.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || <span className="empty-cell">空值</span>}</td>)}</tr>)}</tbody></table></div>}
    {preview.rows.length === 0 && preview.parseErrors.length === 0 && <p className="preview-empty">文件只有表头，暂无数据行。</p>}
  </div>
}

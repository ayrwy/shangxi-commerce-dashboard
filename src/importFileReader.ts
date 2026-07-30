import type { CsvPreview, ImportedFile } from './importSession'

const CHUNK_SIZE = 1024 * 1024

export const readImportedFile = (item: ImportedFile, onComplete: (preview: CsvPreview) => void, onError: (message: string) => void, onProgress?: (progress: number) => void) => {
  const worker = new Worker(new URL('./csvParserWorker.ts', import.meta.url), { type: 'module' })
  let offset = 0
  let cancelled = false
  const cleanup = () => worker.terminate()
  worker.onmessage = (event: MessageEvent<{ preview: CsvPreview }>) => { cleanup(); if (!cancelled) onComplete(event.data.preview) }
  worker.onerror = () => { cleanup(); if (!cancelled) onError('CSV 后台解析失败，请检查文件格式后重试。') }
  worker.postMessage({ type: 'start', previewRows: 100, retainAllRows: true })
  const readNext = () => {
    if (cancelled) return
    if (offset >= item.file.size) { worker.postMessage({ type: 'end' }); onProgress?.(100); return }
    const end = Math.min(offset + CHUNK_SIZE, item.file.size)
    const reader = new FileReader()
    reader.onload = () => {
      if (cancelled) return
      worker.postMessage({ type: 'chunk', text: String(reader.result || '') })
      offset = end
      onProgress?.(Math.round(offset / item.file.size * 100))
      readNext()
    }
    reader.onerror = () => { cleanup(); if (!cancelled) onError('文件读取失败，请重试或移除该文件') }
    reader.onabort = () => { cleanup(); if (!cancelled) onError('文件读取已中断，请重试或移除该文件') }
    reader.readAsText(item.file.slice(offset, end))
  }
  onProgress?.(0)
  readNext()
  return () => { cancelled = true; cleanup() }
}

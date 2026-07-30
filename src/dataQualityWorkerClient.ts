import type { FileMapping, ImportedFile } from './importSession'
import type { DataQualitySummary } from './metricCapabilities'

let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, { resolve: (value: { summary: DataQualitySummary; durationMs: number }) => void; reject: (reason: unknown) => void }>()

const getWorker = () => {
  if (worker) return worker
  worker = new Worker(new URL('./dataQualityWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ requestId: number; summary: DataQualitySummary; durationMs: number }>) => {
    const request = pending.get(event.data.requestId)
    if (!request) return
    pending.delete(event.data.requestId)
    request.resolve({ summary: event.data.summary, durationMs: event.data.durationMs })
  }
  worker.onerror = error => {
    pending.forEach(request => request.reject(error))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export const buildDataQualitySummaryInWorker = (files: ImportedFile[], mappings: FileMapping[]) => new Promise<{ summary: DataQualitySummary; durationMs: number }>((resolve, reject) => {
  const requestId = ++sequence
  pending.set(requestId, { resolve, reject })
  getWorker().postMessage({ requestId, files, mappings })
})

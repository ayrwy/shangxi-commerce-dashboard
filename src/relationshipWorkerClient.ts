import type { DataTable } from './importSession'
import type { RelationshipDiscoveryResult } from './relationshipEngine'

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, { resolve: (value: { result: RelationshipDiscoveryResult; durationMs: number }) => void; reject: (reason: unknown) => void }>()

const getWorker = () => {
  if (worker) return worker
  worker = new Worker(new URL('./relationshipWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ requestId: number; result: RelationshipDiscoveryResult; durationMs: number }>) => {
    const request = pending.get(event.data.requestId)
    if (!request) return
    pending.delete(event.data.requestId)
    request.resolve({ result: event.data.result, durationMs: event.data.durationMs })
  }
  worker.onerror = error => {
    pending.forEach(request => request.reject(error))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export const discoverRelationshipsInWorker = (tables: DataTable[]) => new Promise<{ result: RelationshipDiscoveryResult; durationMs: number }>((resolve, reject) => {
  const id = ++requestId
  pending.set(id, { resolve, reject })
  getWorker().postMessage({ requestId: id, tables })
})

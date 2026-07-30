/// <reference lib="webworker" />
import { discoverTableRelationships } from './relationshipEngine'
import type { DataTable } from './importSession'

self.onmessage = (event: MessageEvent<{ requestId: number; tables: DataTable[] }>) => {
  const startedAt = performance.now()
  const result = discoverTableRelationships(event.data.tables)
  self.postMessage({ requestId: event.data.requestId, result, durationMs: performance.now() - startedAt })
}

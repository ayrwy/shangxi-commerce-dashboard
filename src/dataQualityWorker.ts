/// <reference lib="webworker" />
import { buildDataQualitySummary } from './metricCapabilities'

self.onmessage = (event: MessageEvent<{ requestId: number; files: unknown[]; mappings: unknown[] }>) => {
  const startedAt = performance.now()
  const summary = buildDataQualitySummary(event.data.files as never, event.data.mappings as never)
  self.postMessage({ requestId: event.data.requestId, summary, durationMs: performance.now() - startedAt })
}

/// <reference lib="webworker" />
import { createCsvParser } from './csvParser'

type StartMessage = { type: 'start'; previewRows?: number; retainAllRows?: boolean }
type ChunkMessage = { type: 'chunk'; text: string }
type EndMessage = { type: 'end' }

let parser: ReturnType<typeof createCsvParser> | null = null
let startedAt = 0

self.onmessage = (event: MessageEvent<StartMessage | ChunkMessage | EndMessage>) => {
  const data = event.data
  if (data.type === 'start') {
    parser = createCsvParser({ previewRows: data.previewRows, retainAllRows: data.retainAllRows })
    startedAt = performance.now()
  } else if (data.type === 'chunk') {
    parser?.push(data.text)
  } else if (data.type === 'end' && parser) {
    const preview = parser.finish()
    self.postMessage({ preview, durationMs: performance.now() - startedAt })
    parser = null
  }
}

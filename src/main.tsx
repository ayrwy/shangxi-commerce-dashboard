import { StrictMode, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import DataAssistantWidget from './components/DataAssistantWidget'
import { normalizeImportSession, type ImportSession } from './importSession'
import { loadImportSession, saveImportSession } from './importSessionStorage'
import { applyRelationshipDiscovery } from './relationshipEngine'
import { discoverRelationshipsInWorker } from './relationshipWorkerClient'
import './styles/global.css'

function Root() {
  const [session, setSessionState] = useState<ImportSession>(() => loadImportSession())
  const saveTimer = useRef<number | undefined>(undefined)
  const setSession: Dispatch<SetStateAction<ImportSession>> = useCallback((action) => {
    setSessionState(previous => normalizeImportSession(
      typeof action === 'function' ? action(previous) : action,
    ))
  }, [])

  const discoveryKey = session.tables.map(table => `${table.id}:${table.dataVersion}`).sort().join('|')
  useEffect(() => {
    let active = true
    const tables = session.tables
    if (tables.length < 2) return
    void discoverRelationshipsInWorker(tables).then(({ result, durationMs }) => {
      if (!active) return
      const processedRows = tables.reduce((sum, table) => sum + table.rowCount, 0)
      setSessionState(previous => {
        const updated = applyRelationshipDiscovery(previous, result)
        const diagnostic = {
          key: 'relationship-discovery' as const,
          severity: durationMs > 1500 ? 'warning' as const : 'info' as const,
          message: `关系发现完成：${result.relationships.length} 个候选，处理 ${processedRows.toLocaleString()} 行。`,
          durationMs,
          processedRows,
          generatedAt: new Date().toISOString(),
        }
        return { ...updated, performanceDiagnostics: [...updated.performanceDiagnostics.filter(item => item.key !== 'relationship-discovery'), diagnostic] }
      })
    }).catch(() => {
      if (!active) return
      setSessionState(previous => ({ ...previous, performanceDiagnostics: [...previous.performanceDiagnostics.filter(item => item.key !== 'relationship-discovery'), { key: 'relationship-discovery', severity: 'error', message: '后台关系发现失败，请重新导入或刷新页面。', generatedAt: new Date().toISOString() }] }))
    })
    return () => { active = false }
  }, [discoveryKey])

  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    // Debounce persistence: mapping dropdowns can emit several state updates
    // while a large CSV is still present in memory.
    saveTimer.current = window.setTimeout(() => saveImportSession(session), 700)
    return () => window.clearTimeout(saveTimer.current)
  }, [session])

  return (
    <>
      <App session={session} setSession={setSession} />
      <DataAssistantWidget session={session} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

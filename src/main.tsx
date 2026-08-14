import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { normalizeImportSession, type ImportSession } from './importSession'
import { loadImportSession, saveImportSession } from './importSessionStorage'
import AuthPage from './components/AuthPage'
import LaunchPage from './components/LaunchPage'
import { getCurrentUser, loginBackend, logoutBackend, registerBackend, type BackendUser } from './backendAnalytics'
import { applyRelationshipDiscovery } from './relationshipEngine'
import { discoverRelationshipsInWorker } from './relationshipWorkerClient'
import './styles/global.css'

function Root() {
  const [session, setSessionState] = useState<ImportSession>(() => loadImportSession())
  const [user, setUser] = useState<BackendUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [launchEntered, setLaunchEntered] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const lastSavedDataKey = useRef('')
  const sessionRef = useRef(session)
  sessionRef.current = session
  const setSession: Dispatch<SetStateAction<ImportSession>> = useCallback((action) => {
    setSessionState(previous => normalizeImportSession(
      typeof action === 'function' ? action(previous) : action,
    ))
  }, [])

  useEffect(() => {
    getCurrentUser()
      .then(current => setUser(current))
      .catch(() => setAuthError(null))
      .finally(() => setAuthChecked(true))
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
    const dataKey = [session.versions.data, session.versions.mappings, session.versions.relationships, session.versions.analysis].join(':')
    if (lastSavedDataKey.current === dataKey) return
    lastSavedDataKey.current = dataKey
    window.clearTimeout(saveTimer.current)
    // Debounce persistence: mapping dropdowns can emit several state updates
    // while a large CSV is still present in memory.
    saveTimer.current = window.setTimeout(() => saveImportSession(sessionRef.current), 700)
    return () => window.clearTimeout(saveTimer.current)
  }, [session.versions.data, session.versions.mappings, session.versions.relationships, session.versions.analysis])

  const handleLogout = useCallback(async () => {
    // Clear the UI session even if the server response is unavailable.
    try {
      await logoutBackend()
    } catch {
      // A local UI logout is still safe when the network is interrupted.
    } finally {
      setUser(null)
      setLocalMode(false)
      setAuthError(null)
    }
  }, [])

  if (!authChecked) return <div className="auth-loading">正在检查登录状态…</div>
  if (!launchEntered) return <LaunchPage onEnter={() => setLaunchEntered(true)} />
  if (!user && !localMode) return <AuthPage
    initialError={authError}
    onLogin={async (username, password) => { const current = await loginBackend(username, password); setUser(current); setAuthError(null) }}
    onRegister={async (username, email, password) => { const current = await registerBackend(username, email, password); setUser(current); setAuthError(null) }}
    onLocalMode={() => setLocalMode(true)}
  />

  return (
    <>
      <App session={session} setSession={setSession} backendUser={user} onLogout={user ? handleLogout : undefined} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)

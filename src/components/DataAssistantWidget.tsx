import { useState } from 'react'
import type { ImportSession } from '../importSession'
import DataAssistantPage from './DataAssistantPage'

export default function DataAssistantWidget({ session }: { session: ImportSession }) {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <div className="assistant-overlay">
        <DataAssistantPage session={session} onBack={() => setOpen(false)} />
      </div>
    )
  }

  return (
    <button className="assistant-launcher" onClick={() => setOpen(true)} aria-label="打开数据分析助手">
      <span>AI</span>
      <b>数据助手</b>
    </button>
  )
}

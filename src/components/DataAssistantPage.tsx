import { useMemo, useState } from 'react'
import type { ImportSession } from '../importSession'
import { buildAnalysisModel } from '../analysisModel'
import { MetricEngine, type MetricFilters } from '../metricEngine'
import { buildAssistantContext, type AssistantViz } from '../assistantContext'

type Message = { role: 'user' | 'assistant'; content: string; viz?: AssistantViz }
const quickQuestions = ['当前有几个数据表？', '哪个类目销售额最高？', '行为漏斗哪一步损失最大？', '哪个设备记录最多？']

const rangeFilters = (range: string): Pick<MetricFilters, 'dateStart' | 'dateEnd'> => {
  const days = range === '近7天' ? 7 : range === '近14天' ? 14 : range === '近28天' ? 28 : 0
  if (!days) return {}
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  return { dateStart: start.toISOString().slice(0, 10), dateEnd: end.toISOString().slice(0, 10) }
}

export default function DataAssistantPage({ session, onBack }: { session: ImportSession; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: '你好，我只使用当前数据版本和已确认关系回答。关系未确认时，我会保留并分析原始 ID。' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState('全部数据')
  const [channel, setChannel] = useState('全部渠道')
  const model = useMemo(() => buildAnalysisModel(session), [session])
  const channels = useMemo(() => model ? new MetricEngine(model).getChannelDistribution({}).map(row => row.name) : [], [model])

  const ask = async (preset?: string) => {
    const question = (preset ?? input).trim()
    if (!question || loading) return
    const filters: MetricFilters = { ...rangeFilters(range), channel: channel === '全部渠道' ? undefined : channel }
    const contextData = buildAssistantContext(session, question, filters)
    const next = [...messages, { role: 'user' as const, content: question }]
    setMessages(next); setInput(''); setLoading(true)
    try {
      const response = await fetch('/api/deepseek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, context: contextData.context }) })
      const payload = await response.json() as { answer?: string; error?: string }
      if (!response.ok) throw new Error(payload.error || '助手请求失败')
      setMessages([...next, { role: 'assistant', content: payload.answer || '当前没有得到有效回答。', viz: contextData.viz }])
    } catch (error) {
      setMessages([...next, { role: 'assistant', content: error instanceof Error ? error.message : '助手暂时不可用。' }])
    } finally { setLoading(false) }
  }

  return <section className="assistant-page"><header className="topbar"><div><span className="eyebrow">DATA ASSISTANT · VERIFIED CONTEXT</span><h1>数据分析助手</h1><p>本地工具先按当前筛选计算，再由 AI 解释；只使用已确认关系。</p></div><button onClick={onBack}>返回看板</button></header><div className="assistant-shell"><div className="assistant-intro"><span className="assistant-orb">AI</span><div><strong>围绕当前数据版本提问</strong><p>数据或关系变化后，后续问题会自动使用新版本。</p></div></div><div className="assistant-controls"><label>时间范围<select value={range} onChange={event => setRange(event.target.value)}><option>全部数据</option><option>近7天</option><option>近14天</option><option>近28天</option></select></label><label>渠道<select value={channel} onChange={event => setChannel(event.target.value)}><option>全部渠道</option>{channels.map(item => <option key={item}>{item}</option>)}</select></label></div><div className="assistant-quick">{quickQuestions.map(question => <button key={question} onClick={() => void ask(question)}>{question}</button>)}</div><div className="assistant-messages">{messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? 'AI' : '你'}</span><div><p>{message.content}</p>{message.viz && <div className={`assistant-viz ${message.viz.kind}`}><strong>{message.viz.title}</strong>{message.viz.rows.map(row => <div className="assistant-viz-row" key={`${row.label}-${row.detail ?? ''}`} title={row.detail}><span>{row.label}</span><i style={{ width: `${Math.max((row.value / Math.max(...message.viz!.rows.map(item => item.value), 1)) * 100, row.value ? 8 : 0)}%` }} /><b>{row.value.toLocaleString()}</b>{row.detail && <small>{row.detail}</small>}</div>)}</div>}</div></div>)}{loading && <div className="assistant-message assistant"><span>AI</span><p>正在调用分析工具并生成回答…</p></div>}</div><div className="assistant-composer"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} placeholder="输入关于当前 CSV 数据的问题…" rows={2} /><button onClick={() => void ask()} disabled={!input.trim() || loading}>{loading ? '分析中' : '发送'}</button></div><small className="assistant-footnote">范围：{range} · {channel} · 数据版本 {model?.cacheKey ?? '未确认'}。结果会注明口径；未匹配关系回退原始 ID。</small></div></section>
}

import type { CSSProperties } from 'react'

type LaunchPageProps = {
  onEnter: () => void
}

const signals = [
  { label: '订单数据', value: 'CSV', tone: 'ink' },
  { label: '用户行为', value: '关联', tone: 'olive' },
  { label: '经营洞察', value: '看板', tone: 'signal' },
]

export default function LaunchPage({ onEnter }: LaunchPageProps) {
  return <main className="launch-page">
    <div className="launch-grain" aria-hidden="true" />
    <header className="launch-header">
      <div className="launch-brand" aria-label="商析 经营决策台">
        <img src="/ecommerce-data-platform-logo.svg" alt="" />
        <div><strong>商析</strong><small>经营决策台</small></div>
      </div>
      <span className="launch-edition">E-COMMERCE INTELLIGENCE · 01</span>
    </header>

    <section className="launch-content">
      <div className="launch-copy">
        <p className="launch-kicker">经营数据，转化为下一步判断</p>
        <h1>看见生意<br /><em>正在发生。</em></h1>
        <p className="launch-intro">导入订单与用户行为数据，从结构确认开始，连接每一次经营决策。</p>
        <button className="launch-enter" onClick={onEnter}>
          <span>进入商析</span><i aria-hidden="true">→</i>
        </button>
        <p className="launch-hint">支持 CSV 数据导入 · 多表关联 · 用户与行为分析</p>
      </div>

      <div className="launch-visual" aria-label="经营数据流动示意，非实时业务数据">
        <div className="launch-visual-head"><span>DATA TO DECISION</span><b><i aria-hidden="true" /> 数据流示意</b></div>
        <div className="launch-chart">
          <span className="launch-axis axis-a">120</span>
          <span className="launch-axis axis-b">80</span>
          <span className="launch-axis axis-c">40</span>
          <div className="launch-grid grid-one" /><div className="launch-grid grid-two" /><div className="launch-grid grid-three" />
          <svg viewBox="0 0 700 330" role="img" aria-label="从数据接入到经营判断的趋势示意，非真实业务数据" preserveAspectRatio="none">
            <defs>
              <linearGradient id="launch-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#737b59" stopOpacity=".3" />
                <stop offset="100%" stopColor="#737b59" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="launch-area" d="M0,260 C52,254 68,210 112,218 S166,277 212,232 S276,168 324,185 S377,221 426,155 S480,113 530,145 S595,201 642,102 S677,54 700,66 L700,330 L0,330 Z" />
            <path className="launch-line" d="M0,260 C52,254 68,210 112,218 S166,277 212,232 S276,168 324,185 S377,221 426,155 S480,113 530,145 S595,201 642,102 S677,54 700,66" />
            <circle className="launch-dot dot-one" cx="212" cy="232" r="7" />
            <circle className="launch-dot dot-two" cx="426" cy="155" r="7" />
            <circle className="launch-dot dot-three" cx="642" cy="102" r="8" />
          </svg>
          <span className="launch-date date-one">07 / 01</span><span className="launch-date date-two">07 / 14</span><span className="launch-date date-three">07 / 28</span>
        </div>
        <div className="launch-signal-list">
          {signals.map((signal, index) => <div className={`launch-signal ${signal.tone}`} key={signal.label} style={{ '--delay': `${index * 120}ms` } as CSSProperties & Record<'--delay', string>}>
            <span>{signal.label}</span><strong>{signal.value}</strong><i aria-hidden="true" />
          </div>)}
        </div>
        <p className="launch-visual-note">示意：导入 CSV、确认关系后，生成经营分析看板。</p>
      </div>
    </section>

    <footer className="launch-footer"><span>REACT · DJANGO · MYSQL</span><span>© 2026 SHANGXI</span></footer>
  </main>
}

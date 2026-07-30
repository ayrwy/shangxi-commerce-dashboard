import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
export type ChartConfig =
  | { type: 'line'; labels: string[]; values: number[]; events?: { index: number; title: string }[] }
  | { type: 'bar'; labels: string[]; values: number[] }
  | { type: 'scatter'; values: [number, number, number, string, string][] }
export default function ChartRenderer({ config, className = '' }: { config: ChartConfig; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    const axis = { axisLine: { lineStyle: { color: '#dce5e8' } }, axisTick: { show: false }, axisLabel: { color: '#7d8b91' }, splitLine: { lineStyle: { color: '#edf1f3' } } }
    const common = { animationDuration: 650, tooltip: { trigger: 'axis', borderWidth: 0, backgroundColor: '#172126', textStyle: { color: '#fff' } }, grid: { left: 8, right: 20, top: 28, bottom: 8, containLabel: true } }
    if (config.type === 'line') chart.setOption({ ...common, xAxis: { ...axis, type: 'category', boundaryGap: false, data: config.labels, axisLabel: { color: '#7d8b91', interval: 4 } }, yAxis: { ...axis, type: 'value', axisLine: { show: false }, axisLabel: { color: '#9aa6ab', formatter: (v: number) => `${Math.round(v / 10000)}万` } }, series: [{ type: 'line', data: config.values, smooth: .35, symbol: 'none', lineStyle: { color: '#2864dc', width: 3 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(40,100,220,.25)' }, { offset: 1, color: 'rgba(40,100,220,0)' }]) }, markPoint: config.events ? { symbol: 'pin', symbolSize: 42, label: { formatter: '{b}', color: '#fff', fontSize: 9 }, itemStyle: { color: '#ff7a45' }, data: config.events.map(e => ({ name: e.title, coord: [e.index, config.values[e.index]] })) } : undefined }] })
    if (config.type === 'bar') chart.setOption({ ...common, grid: { left: 6, right: 28, top: 8, bottom: 4, containLabel: true }, xAxis: { ...axis, type: 'value', axisLabel: { show: false }, splitLine: { show: false } }, yAxis: { ...axis, type: 'category', inverse: true, data: config.labels, splitLine: { show: false } }, series: [{ type: 'bar', data: config.values, barWidth: 12, showBackground: true, backgroundStyle: { color: '#eef2f4', borderRadius: 8 }, itemStyle: { color: '#2864dc', borderRadius: 8 }, label: { show: true, position: 'right', formatter: ({ value }: { value: number }) => `${Math.round(value / 10000)}万`, color: '#627178' } }] })
    if (config.type === 'scatter') chart.setOption({ ...common, tooltip: { ...common.tooltip, formatter: (p: { data: [number,number,number,string,string] }) => `${p.data[3]}<br/>增长 ${p.data[0]}% · 转化 ${p.data[1]}%` }, xAxis: { ...axis, type: 'value', name: '销售增长 %' }, yAxis: { ...axis, type: 'value', name: '转化率 %' }, series: [{ type: 'scatter', data: config.values, symbolSize: (v: number[]) => Math.max(18, Math.sqrt(v[2]) / 2.2), label: { show: true, formatter: (p: { data: [number,number,number,string] }) => p.data[3], color: '#172126', position: 'top', fontSize: 11 }, itemStyle: { color: (p: { data: [number,number,number,string,string] }) => p.data[4] === '问题款' ? '#ff7a45' : p.data[4] === '爆款' ? '#13a88a' : '#2864dc', opacity: .78 } }] })
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); chart.dispose() }
  }, [config])
  return <div ref={ref} className={`chart ${className}`} role="img" aria-label="经营数据图表" />
}

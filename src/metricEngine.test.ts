import { recommendationsFromMetrics, type MetricResult } from './metricEngine'

const definition = { source: 'test', granularity: 'test', formula: 'test', dedupKey: 'test' }
const metric = (key: string, value: number, formatted: string): MetricResult => ({ key, label: key, value, formatted, available: true, definition })

const recommendations = recommendationsFromMetrics([metric('refund_amount_rate', 8, '8.00%')])
if (recommendations[0]?.key !== 'refund-rate-high') throw new Error('High refund rate should produce a rule-based recommendation')

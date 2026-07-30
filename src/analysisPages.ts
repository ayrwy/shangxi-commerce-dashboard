import type { MetricCapability } from './importSession'

export type AnalysisPageDefinition = {
  key: string
  label: string
  requiredCapabilities: string[]
  match: 'all' | 'any'
  order: number
}

export const analysisPages: AnalysisPageDefinition[] = [
  { key: '经营总览', label: '经营总览', requiredCapabilities: [], match: 'all', order: 10 },
  { key: '商品和品类分析', label: '商品和品类分析', requiredCapabilities: ['product_rank', 'detail_sales', 'category_rank'], match: 'any', order: 20 },
  { key: '用户分析', label: '用户分析', requiredCapabilities: ['buyers', 'repeat_rate'], match: 'any', order: 30 },
  { key: '用户画像', label: '用户画像', requiredCapabilities: ['user_dimensions'], match: 'all', order: 35 },
  { key: '渠道分析', label: '渠道分析', requiredCapabilities: ['channel'], match: 'all', order: 40 },
  { key: '行为分析', label: '行为分析', requiredCapabilities: ['funnel'], match: 'all', order: 50 },
  { key: '退款分析', label: '退款分析', requiredCapabilities: ['refund_rate', 'refund_order_rate'], match: 'any', order: 60 },
  { key: '字段确认', label: '字段确认', requiredCapabilities: [], match: 'all', order: 80 },
  { key: '数据导入', label: '数据导入', requiredCapabilities: [], match: 'all', order: 90 },
]

export const availableAnalysisPages = (capabilities: MetricCapability[], hasDataset: boolean) => {
  const available = new Set(capabilities.filter(capability => capability.available).map(capability => capability.key))
  return analysisPages
    .filter(page => page.key === '经营总览' || page.key === '数据导入' || page.key === '字段确认' || (hasDataset && (page.match === 'all' ? page.requiredCapabilities.every(key => available.has(key)) : page.requiredCapabilities.some(key => available.has(key)))))
    .sort((a, b) => a.order - b.order)
}

export const capabilityStatus = (capability: MetricCapability) => capability.available ? 'available' : capability.reason ? 'missing_fields' : 'needs_confirmation'

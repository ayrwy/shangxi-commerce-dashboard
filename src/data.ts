export type Channel = '全渠道' | '抖音' | '天猫' | '京东' | '小红书'
const channels: Exclude<Channel, '全渠道'>[] = ['抖音', '天猫', '京东', '小红书']
const weights = [0.34, 0.31, 0.23, 0.12]
export const trendData = Array.from({ length: 28 }, (_, day) => {
  const total = 66500 + day * 620 + Math.sin(day / 2.6) * 7200 + (day === 9 ? 22000 : day === 18 ? 28000 : 0)
  return { date: `2026-07-${String(day + 1).padStart(2, '0')}`, label: `${day + 1}日`, gmv: Math.round(total * weights[day % 4] * 4), channel: channels[day % 4] }
})
export const events = [
  { date: '2026-07-10', title: '达人专场', note: '直播间成交拉升 31%', tone: 'blue' },
  { date: '2026-07-19', title: '夏季上新', note: '新品贡献 18.6 万', tone: 'orange' },
  { date: '2026-07-23', title: '退款高峰', note: '凉感被退款率升至 8.4%', tone: 'red' },
]
export const channelBase = [
  { name: '抖音', gmv: 768420, orders: 3012, conversion: 4.8, change: 18.7 },
  { name: '天猫', gmv: 624760, orders: 2387, conversion: 4.1, change: 6.4 },
  { name: '京东', gmv: 418930, orders: 1641, conversion: 3.6, change: -2.1 },
  { name: '小红书', gmv: 213860, orders: 742, conversion: 2.9, change: 24.3 },
]
export const products = [
  { name: '云感凉被', sales: 286400, growth: 32, conversion: 5.8, tag: '爆款' },
  { name: '原木折叠桌', sales: 214800, growth: 18, conversion: 4.6, tag: '潜力款' },
  { name: '轻氧防晒衣', sales: 186700, growth: 42, conversion: 3.7, tag: '机会款' },
  { name: '冷萃随行杯', sales: 138900, growth: 7, conversion: 4.2, tag: '稳定款' },
  { name: '亚麻四件套', sales: 112600, growth: -12, conversion: 2.4, tag: '问题款' },
]
export const navItems = ['经营总览', '商品和品类分析', '用户分析', '渠道分析', '数据导入']

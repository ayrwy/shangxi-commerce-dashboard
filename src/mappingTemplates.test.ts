import { createMappingTemplate, parseMappingTemplate, serializeMappingTemplate } from './mappingTemplates'

const mapping = { fileId: 'file', role: 'orders' as const, singleTableType: 'order' as const, granularity: 'order' as const, confirmed: true, behaviorValueMappings: {}, fields: [{ source: '订单号', canonical: 'order_id', confidence: 'high' as const }] }
const template = createMappingTemplate('订单模板', [mapping])
if (template.mappings[0]?.fileId !== '') throw new Error('Template should not bind to old file ids')
const restored = parseMappingTemplate(serializeMappingTemplate(template))
if (restored.name !== '订单模板' || restored.mappings[0]?.role !== 'orders') throw new Error('Template round trip failed')

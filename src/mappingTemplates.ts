import type { FileMapping, MappingTemplate } from './importSession'

export const createMappingTemplate = (name: string, mappings: FileMapping[]): MappingTemplate => ({
  version: 1,
  name,
  createdAt: new Date().toISOString(),
  mappings: mappings.map(mapping => ({ ...mapping, fileId: '', confirmed: false })),
})

export const serializeMappingTemplate = (template: MappingTemplate) => JSON.stringify(template, null, 2)

export const parseMappingTemplate = (raw: string): MappingTemplate => {
  const parsed = JSON.parse(raw) as MappingTemplate
  if (parsed.version !== 1 || !Array.isArray(parsed.mappings)) throw new Error('无效的映射模板')
  return parsed
}

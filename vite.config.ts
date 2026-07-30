import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readDeepSeekKey = (root: string) => {
  try {
    const line = readFileSync(join(root, '.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).find(value => /^\s*DEEPSEEK_API_KEY\s*=/.test(value))
    return line?.split('=', 2)[1]?.trim().replace(/^['"]|['"]$/g, '') || ''
  } catch { return '' }
}
const localDeepSeekKey = readDeepSeekKey(join(process.cwd(), '')) || (() => {
  try {
    const line = readFileSync(new URL('./.env', import.meta.url), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).find(value => /^\s*DEEPSEEK_API_KEY\s*=/.test(value))
    return line?.split('=', 2)[1]?.trim().replace(/^['"]|['"]$/g, '') || ''
  } catch { return '' }
})()

const deepseekProxy = (): Plugin => ({
  name: 'deepseek-proxy',
  configureServer(server) {
    server.middlewares.use('/api/deepseek', async (request, response) => {
      if (request.method !== 'POST') { response.statusCode = 405; response.end('Method Not Allowed'); return }
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', async () => {
        const key = localDeepSeekKey || readDeepSeekKey(server.config.root) || loadEnv(server.config.mode, server.config.root, '').DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY
        if (!key) { response.statusCode = 503; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY，请在本地 .env 中设置。' })); return }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { question?: string; context?: string }
          const question = body.question?.trim()
          if (!question) { response.statusCode = 400; response.end(JSON.stringify({ error: '问题不能为空。' })); return }
          const upstream = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.1, messages: [{ role: 'system', content: '你是严谨的数据分析助手。只能使用上下文中的本地工具结果和已确认关系。禁止采用 suggested、rejected 或 disabled 关系。商品和类目结果同时保留原始 ID 与显示名称；未匹配时明确按原始 ID 分析。回答必须说明筛选范围、数据版本、计算口径和已知关系风险；信息不足时明确无法判断，不得编造。' }, { role: 'user', content: `当前 CSV 数据上下文：\n${body.context ?? '无'}\n\n用户问题：${question}` }] }) })
          const payload = await upstream.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
          if (!upstream.ok) throw new Error(payload.error?.message || `DeepSeek 请求失败 (${upstream.status})`)
          response.statusCode = 200; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ answer: payload.choices?.[0]?.message?.content ?? '' }))
        } catch (error) { response.statusCode = 502; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'AI 服务暂时不可用。' })) }
      })
    })
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), deepseekProxy()],
  }
})

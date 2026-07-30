const { chromium } = require('C:/Users/Zhao/AppData/Local/OpenAI/Codex/runtimes/cua_node/f8d2abcb7481383b/bin/node_modules/playwright')
const { writeFileSync } = require('node:fs')
;(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  })
  const results = []
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' })
    const metrics = await page.evaluate(() => ({
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      heading: document.querySelector('h1')?.textContent?.trim() || '',
    }))
    const screenshot = 'C:/Users/Zhao/.codex/visualizations/2026/07/26/019f9c26-c5a6-7211-93ee-8a9f3c0ce49f/p1-' + viewport.width + '.png'
    await page.screenshot({ path: screenshot, fullPage: true })
    results.push({ ...viewport, ...metrics, noHorizontalOverflow: metrics.scrollWidth <= metrics.innerWidth, pageErrors, screenshot })
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' })
  const tempCsv = 'C:/tmp/p1-keyboard.csv'
  writeFileSync(tempCsv, 'user_id,product_id,behavior,datetime,price,amount\nu1,p1,pv,2026-01-01 10:00:00,10,1\nu1,p1,buy,2026-01-01 10:05:00,10,2\n')
  const domSnapshot = await page.evaluate(() => ({ body: document.body.innerText.slice(0, 2000), buttons: [...document.querySelectorAll('button')].map(el => (el.textContent || '').trim()), inputs: [...document.querySelectorAll('input')].map(el => ({ type: el.type, accept: el.accept })) }))
  results.push({ keyboardStart: domSnapshot })
  let input = page.locator('input[type=file]')
  if (await input.count() === 0) {
    const dataButton = page.getByText('数据导入', { exact: false }).first()
    if (await dataButton.isVisible().catch(() => false)) { await dataButton.click(); await page.waitForTimeout(300) }
    input = page.locator('input[type=file]')
  }
  if (await input.count() === 0) throw new Error('UPLOAD_INPUT_MISSING ' + JSON.stringify(domSnapshot))
  await input.setInputFiles(tempCsv)
  await page.waitForTimeout(500)
  const continueButton = page.getByRole('button', { name: /继续配置|继续/ }).last()
  const continueVisible = await continueButton.isVisible().catch(() => false)
  const tabTo = async locator => { for (let i = 0; i < 80; i += 1) { await page.keyboard.press('Tab'); if (await locator.evaluate(el => el === document.activeElement).catch(() => false)) return i + 1 } return null }
  let continueFocus = null
  let continueTabCount = null
  if (continueVisible) {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    continueTabCount = await tabTo(continueButton)
    continueFocus = await continueButton.evaluate(el => { const s = getComputedStyle(el); return { outline: s.outline, boxShadow: s.boxShadow } })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
  }
  const fieldPageVisible = await page.getByText('字段确认', { exact: false }).first().isVisible().catch(() => false)
  const confirmButton = page.getByRole('button', { name: /确认字段|确认映射|确认/ }).last()
  const confirmVisible = await confirmButton.isVisible().catch(() => false)
  let confirmFocus = null
  if (confirmVisible) {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    var confirmTabCount = await tabTo(confirmButton)
    confirmFocus = await confirmButton.evaluate(el => { const s = getComputedStyle(el); return { outline: s.outline, boxShadow: s.boxShadow } })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
  }
  const dashboardButton = page.getByRole('button', { name: /进入经营看板|打开经营看板|经营看板/ }).last()
  const dashboardEnabled = await dashboardButton.isEnabled().catch(() => false)
  let dashboardFocus = null
  if (dashboardEnabled) {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    var dashboardTabCount = await tabTo(dashboardButton)
    dashboardFocus = await dashboardButton.evaluate(el => { const s = getComputedStyle(el); return { outline: s.outline, boxShadow: s.boxShadow } })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
  }
  const finalState = await page.evaluate(() => ({ heading: document.querySelector('h1')?.textContent?.trim() || '', body: document.body.innerText.slice(0, 500), url: location.href }))
  const dashboardVisible = finalState.heading === '经营总览' || finalState.body.includes('经营总览')
  const focusedStyle = await page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return null
    const style = getComputedStyle(el)
    return { tag: el.tagName, text: el.innerText?.trim().slice(0, 60) || '', outline: style.outline, boxShadow: style.boxShadow }
  })
  results.push({ keyboard: { continueVisible, continueTabCount, continueFocus, fieldPageVisible, confirmVisible, confirmTabCount, confirmFocus, dashboardEnabled, dashboardTabCount, dashboardFocus, dashboardVisible, finalState, focusedStyle } })
  await browser.close()
  writeFileSync('C:/Users/Zhao/Documents/shangxi_dashboard/p1-acceptance-results.json', JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
})().catch(error => { console.error(error); process.exit(1) })

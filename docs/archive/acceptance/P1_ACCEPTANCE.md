# P1 验收记录

- 验收日期：2026-07-26
- 测试地址：`http://localhost:5174/`
- 浏览器：Microsoft Edge（Playwright 无头模式）

## 响应式

| 视口 | 横向溢出 | 页面异常 |
| --- | --- | --- |
| 1440 x 900 | 无（1440 / 1440） | 无 |
| 768 x 1024 | 无（768 / 768） | 无 |
| 390 x 844 | 无（390 / 390） | 无 |

截图：

- `C:/Users/Zhao/.codex/visualizations/2026/07/26/019f9c26-c5a6-7211-93ee-8a9f3c0ce49f/p1-1440.png`
- `C:/Users/Zhao/.codex/visualizations/2026/07/26/019f9c26-c5a6-7211-93ee-8a9f3c0ce49f/p1-768.png`
- `C:/Users/Zhao/.codex/visualizations/2026/07/26/019f9c26-c5a6-7211-93ee-8a9f3c0ce49f/p1-390.png`

## 键盘主链路

使用真实 `Tab` + `Enter` 操作：

1. 聚焦“数据导入 / 下一步”：第 8 次 Tab，可见焦点环，Enter 成功进入导入页。
2. 上传 CSV 后聚焦“继续配置”：按钮可用，Enter 成功进入字段确认页。
3. 聚焦“确认字段”：第 10 次 Tab，可见焦点环，Enter 确认映射。
4. 聚焦“进入经营看板”：按钮已启用，第 1 次 Tab，可见焦点环，Enter 成功进入“经营总览”。

## 自动验证

- `npm test`：通过，执行 CSV 解析、退款率分子/分母、退款率计算、重复订单和表关系回归测试。
- `npx tsc -b --pretty false`：通过。
- `npm run build`：通过。
- 生产 JS：1,363.96 kB，gzip 456.02 kB，仍有分包优化空间，不阻断 P0/P1 交付。

# P1-26 验收记录

- 任务：完善用户行为单表
- 实现日期：2026-07-26

## 已完成

- 支持 pv、fav、cart、buy，以及浏览、收藏、加购、购买、支付等常见中文和英文别名。
- 显示原始行为值分布、出现行数和当前识别状态。
- 每个原始行为值都可以手动确认或修改为浏览、收藏、加购、购买、忽略。
- 没有 order_id 时只展示购买行为数，不把行为行数称为真实订单量。
- price 或 amount 任一缺失时，GMV 显示暂无数据，但行为漏斗和行为值分布仍正常计算。
- address、sex、device 已加入标准字段映射，可作为后续分析维度。
- 行为 GMV 只统计购买行为，并按 price × amount 计算。

## 专项验收

- UserBehavior1.csv 行为分布可见。
- 中文和英文购买值可以统一统计。
- 缺少 price/amount 时 GMV 不可用但漏斗可用。
- address、sex、device 可以映射为分析维度。
- npm test：通过，包含行为别名、分布和 GMV 边界测试。
- npx tsc -b --pretty false：通过。
- npm run build：待最终运行。

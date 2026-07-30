# P0-22 验收记录

- 任务：校验角色必需字段
- 实现日期：2026-07-26

## 已完成

- 用户行为表缺少 behavior 时阻断确认；缺少 user_id 时购买用户数、复购率等能力继续显示不可用原因。
- 订单主表必须有 order_id 和 order_amount。
- 订单明细必须有 order_id 和 product_id；销售额能力仍要求 price 和 amount。
- 商品表必须有 product_id，用户表必须有 user_id。
- 商品表和用户表的唯一标识不允许为空或重复。
- 退款表有 refund_amount 但没有订单主表 order_amount 时，阻断确认并明确提示退款率分母不足。
- 缺少可选字段不会伪造指标：指标能力清单继续显示对应中文不可用原因。

## 专项验收

- 订单主表缺少 order_amount：阻断。
- 订单明细包含 order_id、product_id：核心模型校验通过。
- 商品表 product_id 重复：阻断。
- 商品表 product_id 空值：阻断。
- 退款表缺少订单 GMV 分母：阻断。
- npm test：通过，包含缺字段、重复键、空键和退款分母边界测试。
- npx tsc -b --pretty false：通过。
- npm run build：待最终运行。

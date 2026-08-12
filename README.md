<div align="center">

<img src="ecommerce-data-platform-logo.svg" alt="商析 logo" width="120"/>

# 商析 · Shangxi Commerce Dashboard

**面向电商负责人、运营经理和店铺老板的经营分析驾驶舱**

在 30 秒内回答三个问题：**生意现在怎么样？变化由什么造成？下一步应该优先做什么？**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![ECharts](https://img.shields.io/badge/ECharts-5-AA344D)
![Django](https://img.shields.io/badge/Django-5-092E20?logo=django&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

## ✨ 核心特性

- **📊 经营总览看板**：GMV / 销售额、订单量、客单价、转化率、退款率、目标进度，销售趋势线与经营事件时间线（直播、补货、调价、退款高峰直接标注在线上）
- **🛍️ 商品分析**：销售排行、爆款 / 潜力款 / 问题款标签、商品详情抽屉
- **👥 用户分析**：新客与老客结构、复购率趋势、用户价值分层
- **📣 渠道分析**：渠道贡献占比、访问 → 支付转化漏斗、渠道趋势与经营建议
- **📥 CSV 数据导入**：多文件批量上传、行数 / 列数预览、字段确认、表关系诊断
- **🧠 指标引擎**：受控的指标计算，明确数据口径（如行为数据模式下的 GMV 只统计 `behavior=buy`）
- **🤖 数据分析助手**：解释已计算出的趋势与异常，生成经营摘要和行动建议（AI 不直接编造数字）
- **📱 响应式布局**：桌面端为主，窄屏保持可浏览

## 🖥️ 运行效果

> 截图待补充 —— 运行 `npm run dev` 后自行添加图片。

## 🧰 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 · TypeScript · Vite 6 |
| 图表 | ECharts（统一 `ChartRenderer` 渲染，业务模块不直接依赖 ECharts option） |
| 后端 | Django 5 · Django REST Framework · MySQL |
| 数据 | 前端浏览器端 CSV 解析 + 后端导入服务（DuckDB 指标计算规划中） |
| 样式 | 自建 CSS 设计系统（瓷白底 · 墨蓝字 · 钴蓝主色） |

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 9+
- Python 3.10+（仅后端需要）

### 前端

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
```

其他命令：

```bash
npm test           # 运行测试（CSV 解析、指标引擎、关系引擎等）
npm run build      # 生产构建，输出到 dist/
npm run preview    # 预览生产构建
```

### 后端（可选，用于数据导入 API）

```bash
cd backend
Copy-Item .env.example .env     # 按需修改 MySQL 配置
python -m venv .venv
.venv\Scripts\python.exe manage.py makemigrations
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py createsuperuser
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

导入公共演示数据集（需要先创建 staff 用户）：

```bash
.venv\Scripts\python.exe manage.py import_demo_data
```

主要 API：`/api/auth/*`（注册 / 登录 / 登出）、`/api/datasets/*`、`/api/files/*`、`/api/field-mappings/*`、`/api/relationships/*`、`/api/quality-reports/*`，管理后台 `/admin/`。

## 📂 目录结构

```
├── src/                  # 前端源码
│   ├── components/       # 图表组件、页面组件
│   ├── metricEngine.ts   # 指标引擎（统一口径计算）
│   ├── relationshipEngine.ts  # 表关系诊断
│   └── ...
├── backend/              # Django 后端（数据导入、数据集 API）
├── demo-data/            # 本地演示 CSV（订单、商品、用户、渠道）
├── docs/
│   ├── current/          # 仍然有效的项目说明（PROJECT_PLAN.md）
│   └── archive/          # 历史资料（默认无需阅读）
├── scripts/              # 测试与验收脚本
└── vite.config.ts        # 唯一的 Vite 配置
```

## 📖 文档

- [产品计划与设计文档](docs/current/PROJECT_PLAN.md)：产品定位、指标口径、视觉系统、交互原则
- [后端说明](backend/README.md)：API 端点与数据导入流程

## ⚖️ License

MIT

---

**商析** 是一个 v0.1 Demo 项目，用于展示电商经营分析的数据链路与交互体验。当前不接入淘宝、京东、抖音等平台官方 API，不包含账单、订阅与生产部署能力。

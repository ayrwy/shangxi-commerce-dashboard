import { useMemo, useState } from "react";
import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import ChartRenderer from "./components/ChartRenderer";
import { channelBase, products, trendData, type Channel } from "./data";
import { type ImportSession, type MetricCapability } from "./importSession";
import ImportPage from "./components/ImportPage";
import FieldConfirmPage from "./components/FieldConfirmPage";
import { MetricEngine, type MetricResult } from "./metricEngine";
import { buildAnalysisModel } from "./analysisModel";
import { buildGenericMetricCapabilities, buildMetricCapabilities } from "./metricCapabilities";
import { availableAnalysisPages } from "./analysisPages";
type ChanRow = { name: string; gmv: number; orders: number; change?: number };

const money = (v: number) => new Intl.NumberFormat("zh-CN").format(v);
function AnalysisPage({
  active,
  onOpen,
}: {
  active: string;
  onOpen: (x: string) => void;
}) {
  const product = active === "商品和品类分析";
  const rows: any[] = product ? products : channelBase;
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">ANALYSIS BRIEF · DEMO DATA</span>
          <h1>{active}</h1>
          <p>
            {product
              ? "找到值得加码的商品，也及时处理拖累增长的 SKU。"
              : "看清每个渠道带来的成交、效率与下一步动作。"}
          </p>
        </div>
        <button onClick={() => window.print()}>导出简报</button>
      </header>
      <section className="analysis-hero">
        <div>
          <span className="section-kicker">
            {product ? "商品机会" : "渠道结构"}
          </span>
          <h2>{product ? "增长不是平均发生的" : "每一笔成交，都有来源"}</h2>
          <p>
            {product
              ? "轻氧防晒衣增长最快，亚麻四件套需要优先处理。"
              : "抖音贡献最高成交，小红书效率最好，建议增加内容预算。"}
          </p>
        </div>
        <div className="hero-number">
          <strong>{product ? "42%" : "38%"}</strong>
          <span>{product ? "最高商品增长" : "最高渠道增幅"}</span>
        </div>
      </section>
      <section className="analysis-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">
                {product ? "商品排行" : "渠道排行"}
              </span>
              <h2>{product ? "销售额与增长" : "成交额与变化"}</h2>
            </div>
          </div>
          <div className="analysis-list">
            {rows.map((r, i) => (
              <button key={r.name} onClick={() => onOpen(r.name)}>
                <b>0{i + 1}</b>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {product
                      ? r.tag
                      : r.orders + " 单 · 转化 " + r.conversion + "%"}
                  </small>
                </div>
                <em>¥{money(product ? r.sales : r.gmv)}</em>
                <span className={(r.growth ?? r.change) > 0 ? "up" : "down"}>
                  {(r.growth ?? r.change) > 0 ? "+" : ""}
                  {r.growth ?? r.change}%
                </span>
              </button>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">行动提示</span>
              <h2>现在优先看这里</h2>
            </div>
          </div>
          <div className="action-card">
            <strong>{product ? "亚麻四件套" : "京东"}</strong>
            <p>
              {product
                ? "转化率低于均值 1.6pp，建议检查主图与尺码说明。"
                : "近周期成交下降 2.1%，建议复核投放与库存节奏。"}
            </p>
            <button
              onClick={() =>
                onOpen(product ? "亚麻四件套详情" : "京东渠道详情")
              }
            >
              打开详情 →
            </button>
          </div>
          <div className="action-card soft">
            <strong>{product ? "轻氧防晒衣" : "小红书"}</strong>
            <p>
              {product
                ? "增长 42%，可尝试增加关联推荐与内容曝光。"
                : "增幅 24.3%，但预算占比仍偏低，值得加码。"}
            </p>
            <button
              onClick={() =>
                onOpen(product ? "轻氧防晒衣详情" : "小红书渠道详情")
              }
            >
              查看机会 →
            </button>
          </div>
        </article>
      </section>
    </>
  );
}

function RealAnalysisPage({
  active,
  engine,
  capabilities,
  filters,
  onOpen,
}: {
  active: string;
  engine: MetricEngine;
  capabilities: MetricCapability[];
  filters: { channel?: string; dateStart?: string; dateEnd?: string };
  onOpen: (value: string) => void;
}) {
  const filterKey = JSON.stringify(filters);
  const metrics = useMemo(() => engine.computeAll(filters), [engine, filterKey]);
  const capabilityKeys = new Set(
    capabilities
      .filter((capability) => capability.available)
      .map((capability) => capability.key),
  );
  const capabilityKeyString = [...capabilityKeys].sort().join("|");
  const availableMetrics = metrics.filter((metric) => metric.available);
  const productRows = useMemo(() =>
    active === "商品和品类分析" && capabilityKeys.has("product_rank") ? engine.getProductRanking(filters) : [],
    [engine, active, filterKey, capabilityKeyString],
  );
  const categoryRows = useMemo(() =>
    active === "商品和品类分析" && capabilityKeys.has("category_rank") ? engine.getCategoryRanking(filters) : [],
    [engine, active, filterKey, capabilityKeyString],
  );
  const channelRows =
    active === "渠道分析" && capabilityKeys.has("channel")
      ? engine.getChannelDistribution(filters)
      : [];
  const funnelRows =
    active === "行为分析" && capabilityKeys.has("funnel")
      ? engine.getFunnelDistribution(filters)
      : [];
  const dimensionRows =
    active === "用户画像" ? engine.getDimensionDistribution(filters) : {};
  const rfmRows =
    active === "用户分析" && capabilityKeys.has("rfm")
      ? engine.getRfmSegments(filters)
      : [];
  const pageMetrics =
    active === "用户分析"
      ? metrics.filter((metric) =>
          ["buyers", "repeat_rate", "rfm"].includes(metric.key),
        )
      : active === "行为分析"
        ? metrics.filter((metric) => metric.key === "funnel")
        : active === "用户画像"
          ? metrics.filter((metric) => metric.key === "user_dimensions")
          : active === "退款分析"
            ? metrics.filter((metric) =>
                ["refund_amount_rate", "refund_order_rate"].includes(
                  metric.key,
                ),
              )
            : [];
  const title = active === "商品和品类分析" ? "商品和品类分析" : active;
  const hasRows =
    productRows.length > 0 ||
    categoryRows.length > 0 ||
    channelRows.length > 0 ||
    funnelRows.some((row) => row.value > 0) ||
    Object.keys(dimensionRows).length > 0 ||
    rfmRows.length > 0 ||
    pageMetrics.some((metric) => metric.available);
  const relevant =
    active === "商品和品类分析"
      ? capabilities.filter((capability) =>
          ["product_rank", "detail_sales"].includes(capability.key),
        )
      : active === "渠道分析"
        ? capabilities.filter((capability) => capability.key === "channel")
        : active === "用户分析"
          ? capabilities.filter((capability) =>
              ["buyers", "repeat_rate", "rfm"].includes(capability.key),
            )
          : active === "用户画像"
            ? capabilities.filter(
                (capability) => capability.key === "user_dimensions",
              )
            : active === "行为分析"
              ? capabilities.filter((capability) => capability.key === "funnel")
              : capabilities.filter((capability) =>
                  ["refund_rate", "refund_order_rate"].includes(capability.key),
                );
  const businessAdvice: { title: string; detail: string }[] = [];
  const filterScope = `${filters.dateStart || filters.dateEnd ? `${filters.dateStart || "最早记录"} 至 ${filters.dateEnd || "最新记录"}` : "全部时间"} · ${filters.channel ? `渠道 ${filters.channel}` : "全部渠道"}`;
  if (active === "商品和品类分析" && productRows.length > 0) {
    const top = productRows[0];
    businessAdvice.push({ title: "优先关注头部商品", detail: `${top.productName} 当前销售额最高（¥${money(top.salesAmount)}），建议优先保障库存、曝光和详情页转化。` });
  }
  if (active === "商品和品类分析" && categoryRows.length > 0) {
    businessAdvice.push({ title: "把资源集中到高贡献类目", detail: `品类排行已合并在当前页面，可优先比较前 3 个类目的销量和金额，再决定活动位与预算分配。` });
  }
  if (active === "渠道分析" && channelRows.length > 0) {
    const top = channelRows[0];
    const low = channelRows[channelRows.length - 1];
    businessAdvice.push({ title: "放大高贡献渠道", detail: `${top.name} 当前贡献最高（¥${money(top.gmv)}），建议复用其投放素材；${low.name} 可进一步检查流量成本与转化。` });
  }
  if (active === "行为分析" && funnelRows.length > 0) {
    const browse = funnelRows.find((row) => row.key === "pv")?.value ?? 0;
    const buy = funnelRows.find((row) => row.key === "buy")?.value ?? 0;
    const conversion = browse > 0 ? ((buy / browse) * 100).toFixed(2) : "0.00";
    businessAdvice.push({ title: "优先优化行为转化", detail: `浏览到购买的记录转化约为 ${conversion}%，建议重点检查加购到购买之间的商品价格、优惠和结算流程。` });
  }
  if (active === "用户画像") {
    const address = dimensionRows.address?.[0];
    const device = dimensionRows.device?.[0];
    if (address) businessAdvice.push({ title: "围绕核心地区做运营", detail: `${address.value} 是当前记录最多的地区（${address.count.toLocaleString()} 条），可优先安排区域化内容和配送策略。` });
    if (device) businessAdvice.push({ title: "优先优化主流设备体验", detail: `${device.value} 是当前记录最多的设备（${device.count.toLocaleString()} 条），建议重点检查该设备下的页面加载和支付体验。` });
  }
  if (active === "用户分析") {
    const repeat = pageMetrics.find((metric) => metric.key === "repeat_rate");
    if (repeat?.value !== null && repeat?.value !== undefined) businessAdvice.push({ title: "用复购率指导用户运营", detail: `当前复购率为 ${repeat.formatted}，可针对已购买用户设计会员权益、补购提醒或关联推荐。` });
    const rfmTop = rfmRows[0];
    if (rfmTop) businessAdvice.push({ title: `优先运营“${rfmTop.segment}”`, detail: `该层级包含 ${rfmTop.users.toLocaleString()} 位用户（${(rfmTop.share * 100).toFixed(1)}%），建议结合其最近购买、购买频次和金额制定差异化触达。` });
  }
  if (active === "退款分析") {
    const refund = pageMetrics.find((metric) => metric.key === "refund_amount_rate");
    if (refund?.value !== null && refund?.value !== undefined) businessAdvice.push({ title: "先处理退款金额的主要来源", detail: `金额退款率为 ${refund.formatted}，建议下钻到商品、订单和退款原因，优先处理贡献最大的异常项。` });
  }
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">REAL DATA · ANALYSIS</span>
          <h1>{title}</h1>
          <p>当前页面只展示已确认字段能够可靠计算的真实结果。</p>
        </div>
        <button onClick={() => window.print()}>导出简报</button>
      </header>
      {!hasRows && (
        <section className="panel data-empty-banner">
          <strong>当前页面暂无可用结果</strong>
          <p>请查看下方能力说明，补充字段或调整筛选范围。</p>
        </section>
      )}
      <section className="analysis-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">真实结果</span>
              <h2>
                {active === "商品和品类分析"
                  ? "商品销售额排行"
                  : active === "渠道分析"
                    ? "渠道贡献"
                    : active === "用户画像"
                      ? "用户属性分布"
                      : active === "行为分析"
                        ? "行为漏斗"
                        : "指标结果"}
              </h2>
            </div>
          </div>
          {productRows.length > 0 && (
            <div className="analysis-list">
              {productRows.map((row, index) => (
                <button
                  key={row.productId}
                  onClick={() => onOpen(row.productId)}
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <strong>{row.productName}</strong>
                    <small>{row.salesVolume} 件 · ID {row.productId}</small>
                  </div>
                  <em>¥{money(row.salesAmount)}</em>
                  <span>真实数据</span>
                </button>
              ))}
            </div>
          )}
          {categoryRows.length > 0 && (
            <div className="category-rank-section">
              <div className="panel-head compact-rank-head">
                <div>
                  <span className="section-kicker">CATEGORY RANKING</span>
                  <h2>品类销售额排行</h2>
                </div>
              </div>
              <div className="analysis-list category-rank-list">
              {categoryRows.map((row, index) => (
                <button key={row.category} onClick={() => onOpen(row.category)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <strong>{row.category}</strong>
                    <small>{row.salesVolume.toLocaleString()} 件 · ID {row.categoryId}</small>
                  </div>
                  <em>{row.salesAmount > 0 ? `¥${money(row.salesAmount)}` : "按记录数"}</em>
                  <span>真实数据</span>
                </button>
              ))}
              </div>
            </div>
          )}
          {channelRows.length > 0 && (
            <div className="analysis-list">
              {channelRows.map((row, index) => (
                <button key={row.name} onClick={() => onOpen(row.name)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.orders} 单</small>
                  </div>
                  <em>¥{money(row.gmv)}</em>
                  <span>真实数据</span>
                </button>
              ))}
            </div>
          )}
          {active === "行为分析" && funnelRows.length > 0 && (
            <div className="funnel-chart">
              {funnelRows.map((row, index) => {
                const shapeWidth = Math.max(100 - index * 20, 40);
                return (
                  <div className="funnel-step" key={row.key}>
                    <span>{row.label}</span>
                    <div style={{ width: `${shapeWidth}%` }}>
                      <i />
                    </div>
                    <strong>{row.value.toLocaleString()}</strong>
                    {index < funnelRows.length - 1 && <em>→</em>}
                  </div>
                );
              })}
            </div>
          )}
          {active === "用户画像" && (
            <div className="dimension-grid">
              {Object.entries(dimensionRows).map(([key, rows]) => (
                <div className="dimension-card" key={key}>
                  <h3>
                    {key === "address"
                      ? "地址"
                      : key === "device"
                        ? "设备"
                        : key === "province"
                          ? "省份"
                          : "城市"}
                  </h3>
                  {(() => {
                    const maxCount = Math.max(...rows.map((row) => row.count), 1);
                    return rows.map((row) => (
                      <div className="dimension-row" key={row.value}>
                        <span title={row.value}>{row.value}</span>
                        <i className="dimension-bar" style={{ width: `${Math.max((row.count / maxCount) * 100, row.count ? 5 : 0)}%` }} aria-hidden="true" />
                        <b>{row.count.toLocaleString()}</b>
                      </div>
                    ));
                  })()}
                </div>
              ))}
            </div>
          )}
          {pageMetrics.length > 0 && (
            <div className="metrics-grid">
              {pageMetrics.map((metric) => (
                <button
                  className="metric"
                  key={metric.key}
                  onClick={() => onOpen(metric.label)}
                >
                  <span>{metric.label}</span>
                  <strong>{metric.formatted}</strong>
                  <small>来源于当前上传数据</small>
                </button>
              ))}
            </div>
          )}
          {active === "用户分析" && rfmRows.length > 0 && (
            <section className="rfm-panel">
              <div className="rfm-head">
                <div>
                  <span className="section-kicker">RFM SEGMENTATION</span>
                  <h2>用户价值分层</h2>
                </div>
                <span>按最近购买、频次、金额分层</span>
              </div>
              <div className="rfm-grid">
                {rfmRows.map((row) => (
                  <div className="rfm-card" key={row.segment}>
                    <div className="rfm-card-top"><strong>{row.segment}</strong><b>{row.users.toLocaleString()} 人</b></div>
                    <div className="rfm-bar"><i style={{ width: `${Math.max(row.share * 100, 4)}%` }} /></div>
                    <small>占比 {(row.share * 100).toFixed(1)}% · 平均频次 {row.avgFrequency.toFixed(1)} 次</small>
                    <span>建议：{row.segment === "重要价值" ? "维护关系并提供会员权益" : row.segment === "重要挽留" ? "通过召回优惠降低流失" : row.segment === "新客户" ? "推动第二次购买" : "用关联推荐提升贡献"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>
        <article className="panel interpretation-panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">BUSINESS READING</span>
              <h2>业务分析与建议</h2>
            </div>
          </div>
          <p className="interpretation-lead">
            {active === "商品和品类分析"
              ? "结合商品和类目排行，判断资源应该投向哪里。"
              : active === "渠道分析"
                ? "这页帮助你比较不同渠道带来的成交规模。"
                : active === "用户分析"
                  ? "这页帮助你理解购买用户规模与复购表现。"
                  : active === "用户画像"
                    ? "这页帮助你了解用户来自哪里、使用什么设备。"
                    : active === "行为分析"
                      ? "这页帮助你观察用户从浏览到购买的行为变化。"
                      : active === "退款分析"
                        ? "这页帮助你判断退款金额和退款订单对经营结果的影响。"
                : "结合当前数据结果，给出可以直接执行的下一步动作。"}
          </p>
          <div className="interpretation-list">
            {businessAdvice.map((advice) => (
              <div className="interpretation-row advice-row" key={advice.title}>
                <strong>{advice.title}</strong>
                <span>{advice.detail}<small className="advice-scope">范围：{filterScope} · 使用当前实时分析版本</small></span>
              </div>
            ))}
            {pageMetrics.filter((metric) => metric.available).slice(0, 4).map((metric) => (
              <div className="interpretation-row" key={metric.key}>
                <strong>{metric.label}</strong>
                <span>{metric.definition.formula}</span>
              </div>
            ))}
            {pageMetrics.length === 0 && relevant.filter((capability) => capability.available).slice(0, 4).map((capability) => (
              <div className="interpretation-row" key={capability.key}>
                <strong>{capability.label}</strong>
                <span>{capability.definition.formula}</span>
              </div>
            ))}
            {pageMetrics.length === 0 && productRows.length > 0 && (
              <div className="interpretation-row"><strong>排行口径</strong><span>按销售额从高到低排列，件数用于观察销量规模。</span></div>
            )}
            {pageMetrics.length === 0 && dimensionRows && Object.keys(dimensionRows).length > 0 && (
              <div className="interpretation-row"><strong>属性口径</strong><span>按地址、设备等字段统计记录分布，没有 user_id 时不代表去重用户数。</span></div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
// helpers to build display arrays - use unknown cast to bypass strict isolatedModules type inference issues
const buildMetricRow = (m: MetricResult) =>
  [m.label, m.formatted, ""] as [string, string, string];
const buildMetricRows = (
  all: MetricResult[] | undefined,
  eng: MetricEngine,
): [string, string, string][] => {
  if (all && all.length > 0) {
    return all
      .filter((m) => m.available && !["product_rank", "category_rank", "funnel", "user_dimensions"].includes(m.key))
      .slice(0, 6)
      .map(buildMetricRow);
  }
  return [];
};
const buildBarPairs = (
  chans: ChanRow[],
): { labels: string[]; values: number[] } => ({
  labels: chans.map((x) => x.name),
  values: chans.map((x) => x.gmv),
});

function InsightDrawer({
  title,
  engine,
  filters,
  onClose,
}: {
  title: string;
  engine: MetricEngine | null;
  filters: { channel?: string; dateStart?: string; dateEnd?: string };
  onClose: () => void;
}) {
  const metrics = engine?.computeAll(filters) ?? [];
  const metric = metrics.find((item) => item.label === title || item.key === title);
  const channels = engine?.getChannelDistribution(filters) ?? [];
  const channel = channels.find((item) => title.startsWith(item.name));
  const products = engine?.getProductRanking(filters) ?? [];
  const product = products.find((item) => title.includes(item.productId) || title.includes(item.productName));
  const categories = engine?.getCategoryRanking(filters) ?? [];
  const category = categories.find((item) => title.includes(item.category) || title.includes(item.categoryId));
  const trend = engine?.getDailyTrend(filters) ?? [];
  const currentValue = metric?.formatted ?? (channel ? `¥${money(channel.gmv)}` : product ? `¥${money(product.salesAmount)}` : category ? (category.salesAmount > 0 ? `¥${money(category.salesAmount)}` : `${category.salesVolume} 件`) : "当前筛选下暂无数值");
  const insights: string[] = [];
  const actions: string[] = [];
  if (channel) {
    insights.push(`${channel.name}贡献 ¥${money(channel.gmv)}，共 ${channel.orders.toLocaleString()} 单。`);
    actions.push("对比该渠道的流量成本、转化率和客单价，确认增长是否值得继续加码");
  } else if (product) {
    insights.push(`${product.productName} 销售 ${product.salesVolume.toLocaleString()} 件，销售额 ¥${money(product.salesAmount)}；原始 ID 为 ${product.productId}。`);
    actions.push("检查库存、毛利和详情页转化，决定是否增加曝光或关联推荐");
  } else if (category) {
    insights.push(`${category.category} 销售 ${category.salesVolume.toLocaleString()} 件，原始 ID 为 ${category.categoryId}，当前按销售额参与类目排行。`);
    actions.push("比较该类目下的商品贡献，优先处理高销量低销售额或高销售额低库存的商品");
  } else if (metric) {
    if (metric.key === "gmv" && trend.length > 1) {
      const first = trend[0].gmv, last = trend[trend.length - 1].gmv;
      insights.push(`当前趋势从 ¥${money(first)} 变化到 ¥${money(last)}，${last >= first ? "末期高于初期" : "末期低于初期"}。`);
      actions.push("查看峰值日期对应的渠道、商品和活动，确认变化是否可复用");
    } else if (metric.key === "repeat_rate") {
      insights.push(`复购率为 ${metric.formatted}，反映购买用户再次购买的比例。`);
      actions.push("针对已购买用户设计补购提醒、会员权益和关联推荐");
    } else if (metric.key === "buyers") {
      insights.push(`当前有 ${metric.formatted}，口径为去重 user_id。`);
      actions.push("结合 RFM 分层识别高价值用户，并对沉默用户安排召回");
    } else {
      insights.push(`${metric.label} 当前为 ${metric.formatted}，结果来自当前筛选范围内的真实数据。`);
      actions.push("对比上一个时间周期，确认变化方向后再决定运营动作");
    }
  } else {
    insights.push("当前抽屉与看板筛选条件联动，详细结果会随数据和时间范围更新。");
    actions.push("先查看异常贡献最高的商品或渠道，再进入对应分析页面下钻");
  }
  actions.push("执行调整后在相同筛选范围内复看指标，避免只看单日波动");
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer insight-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="关闭详情">×</button>
        <span className="section-kicker">REAL DATA · DETAIL</span>
        <h2>{title}</h2>
        <div className="drawer-value"><span>当前筛选结果</span><strong>{currentValue}</strong><small>{filters.dateStart || filters.dateEnd ? `${filters.dateStart || "最早记录"} 至 ${filters.dateEnd || "最新记录"}` : "全部时间"} · {filters.channel ? `渠道：${filters.channel}` : "全渠道"} · 实时数据</small></div>
        <div className="drawer-section"><h3>数据发现</h3><ul className="drawer-insights">{insights.map((item) => <li key={item}>{item}</li>)}</ul></div>
        {metric && <div className="drawer-definition"><span>计算口径</span><p>{metric.definition.formula}</p><small>来源：{metric.definition.source} · 去重：{metric.definition.dedupKey}</small></div>}
        <div className="drawer-section"><h3>建议动作</h3><ul>{actions.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </aside>
    </div>
  );
}

export default function App({
  session: importSession,
  setSession: setImportSession,
}: {
  session: ImportSession;
  setSession: Dispatch<SetStateAction<ImportSession>>;
}) {
  const engine = useMemo(() => {
    const model = buildAnalysisModel(importSession);
    return model ? new MetricEngine(model) : null;
  }, [importSession]);
  const dashboardCapabilities = useMemo(
    () => buildGenericMetricCapabilities(importSession.tables, importSession.relationships, buildMetricCapabilities(importSession.files, importSession.mappings)),
    [importSession],
  );
  const availablePages = useMemo(
    () => availableAnalysisPages(dashboardCapabilities, Boolean(engine)),
    [dashboardCapabilities, engine],
  );
  useEffect(() => {
    if (engine) setIsReal(true);
  }, [engine]);
  const [isReal, setIsReal] = useState(false);
  useEffect(() => {
    if (isReal) setRange("全部数据");
  }, [isReal]);
  const [channel, setChannel] = useState<Channel>("全渠道");
  const [range, setRange] = useState("近28天");
  const [active, setActive] = useState("经营总览");
  const [drawer, setDrawer] = useState<string | null>(null);
  useEffect(() => {
    if (!availablePages.some((page) => page.key === active))
      setActive("\u7ecf\u8425\u603b\u89c8");
  }, [availablePages, active]);
  const factor = range === "近7天" ? 0.27 : range === "近14天" ? 0.53 : 1;
  const count = range === "近7天" ? 7 : range === "近14天" ? 14 : 28;
  const trend = useMemo(() => {
    const d = trendData.slice(-count);
    return channel === "全渠道" ? d : d.filter((x) => x.channel === channel);
  }, [channel, count]);
  const chans =
    channel === "全渠道"
      ? channelBase
      : channelBase.filter((x) => x.name === channel);
  const gmv = chans.reduce((s, x) => s + x.gmv, 0) * factor;
  const orders = chans.reduce((s, x) => s + x.orders, 0) * factor;
  const conv = chans.reduce((s, x) => s + x.conversion, 0) / chans.length;
  const rangeDate = useMemo(() => {
    if (range === "全部数据") return { dateStart: "", dateEnd: "" };
    const end = new Date();
    const days = range === "近7天" ? 7 : range === "近14天" ? 14 : 28;
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return {
      dateStart: start.toISOString().slice(0, 10),
      dateEnd: end.toISOString().slice(0, 10),
    };
  }, [range]);
  const realMetrics = useMemo(
    () =>
      engine?.computeAll({
        channel: channel === "全渠道" ? undefined : channel,
        dateStart: rangeDate.dateStart,
        dateEnd: rangeDate.dateEnd,
      }),
    [engine, channel, rangeDate],
  );
  const realDataEmpty =
    isReal &&
    engine &&
    range !== "全部数据" &&
    (!realMetrics || !realMetrics.some((m) => m.available));
  const realModeCustom = isReal && engine && engine.model.mode === "custom";
  const realRows =
    isReal && engine ? buildMetricRows(realMetrics, engine) : null;
  const metrics: [string, string, string][] =
    isReal && engine
      ? realRows && realRows.length > 0
        ? realRows.map((r) => [
            r[0],
            r[1],
            engine.model.tables.length + " 个数据表",
          ])
        : [
            ["暂无数据", "—", ""],
            ["—", "—", ""],
            ["—", "—", ""],
            ["—", "—", ""],
            ["—", "—", ""],
          ]
      : [
          ["销售额 GMV", "¥" + money(gmv), "+12.8%"],
          ["支付订单", money(orders), "+9.6%"],
          ["客单价", "¥" + money(gmv / orders), "+2.9%"],
          ["支付转化率", conv.toFixed(1) + "%", "+0.6pp"],
          ["退款率", "5.2%", "+1.1pp"],
        ];
  const realChannelDist = useMemo(
    () =>
      isReal
        ? engine?.getChannelDistribution({
            channel: channel === "全渠道" ? undefined : channel,
            dateStart: rangeDate.dateStart,
            dateEnd: rangeDate.dateEnd,
          })
        : null,
    [engine, channel, isReal, rangeDate],
  );
  const realTrend = useMemo(
    () =>
      isReal
        ? engine?.getDailyTrend({
            channel: channel === "全渠道" ? undefined : channel,
            dateStart: rangeDate.dateStart,
            dateEnd: rangeDate.dateEnd,
          })
        : null,
    [engine, channel, isReal, rangeDate],
  );
  const realProducts = useMemo(
    () =>
      isReal
        ? engine?.getProductRanking({
            channel: channel === "全渠道" ? undefined : channel,
            dateStart: rangeDate.dateStart,
            dateEnd: rangeDate.dateEnd,
          })
        : null,
    [engine, channel, isReal, rangeDate],
  );
  const hasRealTrend = isReal && realTrend && realTrend.length > 0;
  const hasRealProducts = isReal && realProducts && realProducts.length > 0;
  const hasRealChannels =
    isReal && realChannelDist && realChannelDist.length > 0;
  const realChans: ChanRow[] = hasRealChannels
    ? realChannelDist!
    : isReal && engine
      ? []
      : realChannelDist && realChannelDist.length > 0
        ? realChannelDist
        : (chans as ChanRow[]);
  const barPairs = buildBarPairs(realChans);
  const realGmv =
    isReal && realChannelDist && realChannelDist.length > 0
      ? realChannelDist.reduce((s, x) => s + x.gmv, 0)
      : gmv;
  const line = {
    type: "line" as const,
    labels: hasRealTrend
      ? realTrend!.map((x) => x.date.slice(5))
      : isReal && engine
        ? []
        : trend.map((x) => x.date.slice(5)),
    values: hasRealTrend
      ? realTrend!.map((x) => x.gmv)
      : isReal && engine
        ? []
        : trend.map((x) => x.gmv),
  };
  const bar: { type: "bar"; labels: string[]; values: number[] } = {
    type: "bar",
    labels: barPairs.labels,
    values: barPairs.values,
  };
  const prevRangeDate = useMemo(() => {
    if (range === "全部数据") return { dateStart: "", dateEnd: "" };
    const days = range === "近7天" ? 7 : range === "近14天" ? 14 : 28;
    const prevEnd = new Date(
      new Date(rangeDate.dateStart).getTime() - 86400000,
    );
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
    return {
      dateStart: prevStart.toISOString().slice(0, 10),
      dateEnd: prevEnd.toISOString().slice(0, 10),
    };
  }, [rangeDate, range]);
  const realPrevProducts = useMemo(
    () =>
      isReal
        ? engine?.getProductRanking({
            channel: channel === "全渠道" ? undefined : channel,
            dateStart: prevRangeDate.dateStart,
            dateEnd: prevRangeDate.dateEnd,
          })
        : null,
    [engine, channel, isReal, prevRangeDate],
  );
  const scatterValues: [number, number, number, string, string][] =
    hasRealProducts
      ? realProducts!.map((x) => {
          const prev = realPrevProducts?.find(
            (p) => p.productId === x.productId,
          );
          const g =
            prev && prev.salesAmount > 0
              ? Math.round(
                  ((x.salesAmount - prev.salesAmount) / prev.salesAmount) * 100,
                )
              : 0;
          return [g, 0, x.salesAmount, x.productId, prev ? "环比" : "暂无环比"];
        })
      : isReal && engine
        ? []
        : products.map((x) => [x.growth, x.conversion, x.sales, x.name, x.tag]);
  const scatter = { type: "scatter" as const, values: scatterValues };
  const realBrief = useMemo(
    () => (isReal ? engine?.getBriefText() : null),
    [engine, isReal],
  );
  const realChannelOptions = useMemo(() => {
    const dist = isReal ? engine?.getChannelDistribution({}) : null;
    return dist && dist.length > 0
      ? dist.map((d) => d.name)
      : ["抖音", "天猫", "京东", "小红书"];
  }, [engine, isReal]);
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/ecommerce-data-platform-logo.svg" />
          <div>
            <strong>商析</strong>
            <small>经营决策台</small>
          </div>
        </div>
        <nav>
          {availablePages.map((page) => {
            const x = page.key;
            return (
              <button
                className={active === x ? "active" : ""}
                onClick={() => setActive(x)}
                key={x}
              >
                ◈ {x}
                {x === "数据导入" && <i>下一步</i>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          {isReal && engine
            ? "● 真实数据运行中"
            : active === "数据导入"
              ? "● 数据导入"
              : "● 示例数据运行中"}
          <small>
            更新于{" "}
            {new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </div>
      </aside>
      <main className="workspace">
        {active === "经营总览" ? (
          <>
            <header className="topbar">
              <div>
                <span className="eyebrow">
                  {isReal && engine ? "REAL DATA" : "BUSINESS PULSE · 07/25"}
                </span>
                <h1>经营总览</h1>
                <p>
                  {isReal && engine
                    ? "以下指标基于您上传的数据实时计算。"
                    : "先看变化，再决定今天把精力放在哪里。"}
                </p>
              </div>
              <div className="filters">
                <label>
                  时间范围
                  <select
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                  >
                    <option>近7天</option>
                    <option>近14天</option>
                    <option>近28天</option>
                    <option>全部数据</option>
                  </select>
                </label>
                <label>
                  销售渠道
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as Channel)}
                  >
                    <option>全渠道</option>
                    {realChannelOptions.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => window.print()}>导出简报</button>
                {engine && (
                  <span className="source-toggle">
                    <button
                      className={isReal ? "active" : ""}
                      onClick={() => setIsReal(true)}
                    >
                      真实数据
                    </button>
                    <button
                      className={!isReal ? "active" : ""}
                      onClick={() => setIsReal(false)}
                    >
                      示例数据
                    </button>
                  </span>
                )}
              </div>
            </header>
            {isReal && realDataEmpty && (
              <div className="data-empty-banner">
                当前时间范围内没有数据，请切换到“全部数据”或调整日期范围。
              </div>
            )}
            {realModeCustom && (
              <div className="data-empty-banner">
                当前数据缺少渠道/商品/金额字段，部分图表不可用。请检查字段映射配置。
              </div>
            )}
            <section className="brief-strip">
              <b>
                今日
                <br />
                简报
              </b>
              {isReal && engine ? (
                realBrief ? (
                  <p>
                    <strong>数据简报，</strong>
                    {realBrief}
                  </p>
                ) : (
                  <p>
                    <strong>数据简报，</strong>暂无简报数据。
                  </p>
                )
              ) : (
                <p>
                  <strong>整体成交保持增长，</strong>
                  抖音与小红书贡献主要增量；退款率连续 3
                  天上行，主要集中在云感凉被的"尺寸不符"。
                </p>
              )}
              <button onClick={() => setDrawer("今日经营简报")}>
                查看原因 →
              </button>
            </section>
            <section className="metrics-grid">
              {metrics.map((m) => (
                <button
                  className={
                    m[0] === "支付订单" ? "metric metric-orders" : "metric"
                  }
                  key={m[0]}
                  onClick={() => setDrawer(m[0])}
                >
                  <span>{m[0]}</span>
                  <strong>{m[1]}</strong>
                  <small>
                    {m[2]} <em>较上周期</em>
                  </small>
                </button>
              ))}
            </section>
            {(!isReal || hasRealTrend) && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">交易脉搏</span>
                    <h2>销售趋势</h2>
                  </div>
                  <span className="legend">● 销售额</span>
                </div>
                <ChartRenderer config={line} className="pulse-chart" />
              </section>
            )}
            {(!isReal || hasRealChannels) && (
              <section className="split-grid">
                <article className="panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">收入结构</span>
                      <h2>渠道贡献</h2>
                    </div>
                  </div>
                  <ChartRenderer config={bar} className="channel-chart" />
                  <div className="channel-table">
                    {realChans.map((x) => (
                      <button
                        key={x.name}
                        onClick={() => {
                          setChannel(x.name as Channel);
                          setDrawer(x.name + "渠道");
                        }}
                      >
                        <strong>{x.name}</strong>
                        <span>{x.orders + " 单"}</span>
                        <em>
                          {x.change
                            ? (x.change > 0 ? "+" : "") + x.change + "%"
                            : ""}
                        </em>
                      </button>
                    ))}
                  </div>
                </article>
                {!isReal && (
                  <article className="panel insight-panel">
                    <div className="panel-head">
                      <div>
                        <span className="section-kicker">今日判断</span>
                        <h2>
                          {isReal && engine
                            ? "当前数据暂不支持该分析"
                            : "优先做这 3 件事"}
                        </h2>
                      </div>
                    </div>
                    {isReal && engine ? (
                      <p
                        style={{
                          padding: 16,
                          color: "var(--color-ink-muted)",
                          fontSize: 13,
                        }}
                      >
                        真实数据模式下暂不支持自动生成经营建议。请参考上方指标和图表进行分析判断。
                      </p>
                    ) : (
                      <ol>
                        <li>
                          <b>01</b>
                          <div>
                            <strong>检查云感凉被尺码描述</strong>
                            <p>
                              退款率高于店铺均值 3.2pp，预计可减少约 ¥18,600
                              损失。
                            </p>
                          </div>
                          <button onClick={() => setDrawer("退款原因")}>
                            去处理
                          </button>
                        </li>
                        <li>
                          <b>02</b>
                          <div>
                            <strong>为轻氧防晒衣补充流量</strong>
                            <p>近 7 天自然成交增长 42%。</p>
                          </div>
                          <button onClick={() => setDrawer("商品机会")}>
                            看商品
                          </button>
                        </li>
                        <li>
                          <b>03</b>
                          <div>
                            <strong>复用小红书高转化素材</strong>
                            <p>内容点击率高于其他渠道 27%。</p>
                          </div>
                          <button onClick={() => setDrawer("渠道素材")}>
                            看渠道
                          </button>
                        </li>
                      </ol>
                    )}
                  </article>
                )}
              </section>
            )}
            {(!isReal || hasRealProducts) && (
              <section className="panel product-panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">商品机会</span>
                    <h2>
                      {hasRealProducts
                        ? "商品销售额排行"
                        : "增长 × 转化机会矩阵"}
                    </h2>
                    {hasRealProducts && (
                      <small style={{ marginLeft: 8, color: "var(--muted)" }}>
                        暂无环比数据
                      </small>
                    )}
                  </div>
                </div>
                <ChartRenderer config={scatter} className="product-chart" />
              </section>
            )}
          </>
        ) : active === "数据导入" ? (
          <ImportPage
            session={importSession}
            setSession={setImportSession}
            onOpen={setDrawer}
            onConfigure={() => setActive("字段确认")}
          />
        ) : active === "字段确认" ? (
          <FieldConfirmPage
            session={importSession}
            setSession={setImportSession}
            onOpen={setDrawer}
            onBack={() => setActive("数据导入")}
            onEnterDashboard={() => setActive("\u7ecf\u8425\u603b\u89c8")}
          />
        ) : (
          <>
            {isReal && engine ? (
              <RealAnalysisPage
                active={active}
                engine={engine}
                capabilities={dashboardCapabilities}
                filters={{
                  channel:
                    channel === "\u5168\u6e20\u9053" ? undefined : channel,
                  dateStart: rangeDate.dateStart,
                  dateEnd: rangeDate.dateEnd,
                }}
                onOpen={setDrawer}
              />
            ) : (
              <AnalysisPage active={active} onOpen={setDrawer} />
            )}
          </>
        )}
      </main>
      {drawer && (
        <InsightDrawer
          title={drawer}
          engine={engine}
          filters={{
            channel: channel === "全渠道" ? undefined : channel,
            dateStart: rangeDate.dateStart,
            dateEnd: rangeDate.dateEnd,
          }}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

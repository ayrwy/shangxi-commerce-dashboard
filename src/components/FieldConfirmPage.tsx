import {
  buildBehaviorSummary,
  buildMetricCapabilities,
  buildModelValidation,
  buildOrderItemsSummary,
  buildOrderMultiTableSummary,
  buildOrderWideSummary,
  buildDataQualitySummary,
} from "../metricCapabilities";
import { useEffect, useMemo, useState } from "react";
import { buildDataQualitySummaryInWorker } from "../dataQualityWorkerClient";
import type { FieldMapping } from "../importSession";
import {
  detectSingleTableType,
  duplicateCanonicalMappings,
  duplicateRoleGroups,
  granularityConflict,
  mergeRoleFiles,
  buildMergePreview,
  recommendedGranularity,
  roleLabel,
  rowGranularityDescription,
  rowGranularityLabel,
  singleTableTypeConflict,
  singleTableTypeDescription,
  singleTableTypeLabel,
  removeSessionRelationship,
  updateSessionRelationship,
  type DimensionType,
  type DuplicateRoleAction,
  type FileRole,
  type FileMapping,
  type ImportSession,
  type MergePreview,
  type RelationshipDecision,
  type RowGranularity,
  type SingleTableType,
  type TableRelationship,
} from "../importSession";
import {
  buildEnhancedRelationships,
  evaluateManualRelationship,
  type EnhancedRelationshipCheck,
  type RelationshipCardinality,
} from "../relationshipEngine";
import { availableAnalysisPages, capabilityStatus } from "../analysisPages";
import LoadingNotice from "./LoadingNotice";

type Props = {
  session: ImportSession;
  setSession: React.Dispatch<React.SetStateAction<ImportSession>>;
  onOpen: (value: string) => void;
  onBack: () => void;
  onEnterDashboard?: () => void;
};
const canonicalLabels: Record<string, string> = {
  "": "不映射",
  user_id: "用户 ID",
  product_id: "商品 ID",
  order_id: "订单 ID",
  behavior: "行为",
  datetime: "时间",
  price: "单价",
  amount: "数量",
  order_amount: "订单金额",
  product_name: "商品名称",
  category: "类目 ID",
  category_id: "类目 ID",
  category_label: "类目名称",
  channel: "渠道",
  refund_amount: "退款金额",
  refund_at: "退款时间",
  address: "地址维度",
  sex: "性别维度",
  device: "设备维度",
};
const canonicalOptions = Object.keys(canonicalLabels);
const dimensionTypeLabels: Record<DimensionType, string> = {
  text: "文本维度",
  numeric: "数值维度",
  date: "日期维度",
  ignore: "忽略",
};
const dimensionTypeOptions: DimensionType[] = [
  "text",
  "numeric",
  "date",
  "ignore",
];
const granularityOptions: RowGranularity[] = [
  "behavior",
  "order",
  "order_item",
  "product",
  "user",
  "refund",
  "custom",
];
const money = (value: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
const canonicalDisplay = (canonical: string) =>
  canonicalLabels[canonical] ?? canonical;

type RelationshipDraft = {
  id?: string;
  leftTableId: string;
  leftField: string;
  rightTableId: string;
  rightField: string;
  displayField: string;
};

const emptyRelationshipDraft = (): RelationshipDraft => ({
  leftTableId: "",
  leftField: "",
  rightTableId: "",
  rightField: "",
  displayField: "",
});

export default function FieldConfirmPage({
  session,
  setSession,
  onOpen,
  onBack,
  onEnterDashboard,
}: Props) {
  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipDraft | null>(null);
  const [workerQuality, setWorkerQuality] = useState<ReturnType<typeof buildDataQualitySummary> | null>(null);
  useEffect(() => {
    let active = true;
    void buildDataQualitySummaryInWorker(session.files, session.mappings).then(({ summary }) => {
      if (active) setWorkerQuality(summary);
    }).catch(() => { if (active) setWorkerQuality(null); });
    return () => { active = false; };
  }, [session.files, session.mappings]);
  const confirmed = session.confirmed;
  const roles = session.files.map((file) => ({
    file,
    mapping: session.mappings.find((mapping) => mapping.fileId === file.id),
  }));
  const hasBlockingFiles =
    session.files.length === 0 ||
    session.files.some(
      (file) =>
        file.status === "reading" ||
        file.status === "queued" ||
        file.status === "error",
    );
  const behaviorEntry = roles.find(
    ({ mapping }) => mapping?.role === "behavior",
  );
  let capabilities = session.capabilities.length ? session.capabilities : [];
  let behaviorSummary: ReturnType<typeof buildBehaviorSummary> = null;
  let orderSummary: ReturnType<typeof buildOrderMultiTableSummary> = null;
  let orderItemsSummary: ReturnType<typeof buildOrderItemsSummary> = null;
  let orderWideSummary: ReturnType<typeof buildOrderWideSummary> = null;
  let isOrderSingleTable = false;
  let hasChannelCapability = false;
  let hasRepeatRateCapability = false;
  let quality: ReturnType<typeof buildDataQualitySummary> = {
    issues: [],
    errorCount: 0,
    warningCount: 0,
    totalRows: 0,
    timeRanges: [],
  };
  let summaryError = "";
  try {
    capabilities = buildMetricCapabilities(session.files, session.mappings);
    behaviorSummary = behaviorEntry?.mapping
      ? buildBehaviorSummary(behaviorEntry.file, behaviorEntry.mapping)
      : null;
    orderSummary = buildOrderMultiTableSummary(session.files, session.mappings);
    orderItemsSummary = buildOrderItemsSummary(session.files, session.mappings);
    orderWideSummary = buildOrderWideSummary(session.files, session.mappings);
    // Large-file quality checks run in a Worker below; keep the first render responsive.
  } catch (error) {
    summaryError = error instanceof Error ? error.message : "无法计算导入摘要";
  }
  if (workerQuality) quality = workerQuality;
  isOrderSingleTable =
    orderSummary !== null &&
    orderSummary.itemCount === 0 &&
    orderSummary.refundAmount === 0;
  hasChannelCapability =
    capabilities.find((c) => c.key === "channel")?.available === true;
  hasRepeatRateCapability =
    capabilities.find((c) => c.key === "repeat_rate")?.available === true;
  const hasQualityErrors = quality.errorCount > 0;
  const modelValidation = useMemo(
    () => buildModelValidation(session.files, session.mappings),
    [session.files, session.mappings],
  );
  const hasModelErrors = modelValidation.errorCount > 0;
  const singleTableIssues = roles.flatMap(({ file, mapping }) => {
    if (!mapping) return [];
    const conflict = singleTableTypeConflict(
      mapping.role,
      mapping.singleTableType,
    );
    return conflict ? [file.name + "：" + conflict] : [];
  });
  const hasSingleTableErrors = singleTableIssues.length > 0;
  const granularityIssues = roles.flatMap(({ file, mapping }) => {
    if (!mapping) return [file.name + "：缺少粒度配置，请重新上传或返回修改。"];
    const conflict = granularityConflict(mapping.role, mapping.granularity);
    return conflict ? [file.name + "：" + conflict] : [];
  });
  const hasGranularityErrors = granularityIssues.length > 0;
  const duplicateMappings = useMemo(
    () => roles.flatMap(({ file, mapping }) =>
      duplicateCanonicalMappings(mapping).map((item) => ({ file, mapping, ...item })),
    ),
    [session.files, session.mappings],
  );
  const hasDuplicateMappings = duplicateMappings.length > 0;
  const duplicateRoleGroupsState = duplicateRoleGroups(session.mappings);
  const unresolvedDuplicateRoles = duplicateRoleGroupsState.filter(
    (group) =>
      !session.duplicateRoleDecisions.some(
        (decision) => decision.role === group.role,
      ),
  );
  const hasUnresolvedDuplicateRoles = unresolvedDuplicateRoles.length > 0;
  const separateDuplicateRoles = session.duplicateRoleDecisions
    .filter((decision) => decision.action === "separate")
    .map((decision) => roleLabel[decision.role]);
  const hasSeparateDuplicateRoles = separateDuplicateRoles.length > 0;
  const mergePreviews = unresolvedDuplicateRoles
    .map((group) =>
      buildMergePreview(session.files, session.mappings, group.role),
    )
    .filter((p): p is MergePreview => p !== null);
  const hasMergeWarnings = mergePreviews.some((p) => !p.compatible);
  const enhancedRelResult = useMemo(
    () => buildEnhancedRelationships(session.files, session.mappings),
    [session.files, session.mappings],
  );
  const tableById = (tableId: string) => session.tables.find((table) => table.id === tableId);
  const relationshipDiagnosticMap = useMemo(() => {
    const grouped = new Map<string, typeof session.relationshipDiagnostics>();
    session.relationshipDiagnostics.forEach((diagnostic) => {
      const current = grouped.get(diagnostic.relationshipId) ?? [];
      current.push(diagnostic);
      grouped.set(diagnostic.relationshipId, current);
    });
    return grouped;
  }, [session.relationshipDiagnostics]);
  const draftEvaluation = useMemo(() => relationshipDraft
    ? evaluateManualRelationship(session.tables, relationshipDraft)
    : null, [relationshipDraft, session.tables]);
  const openRelationshipDraft = (relationship?: TableRelationship) => {
    setRelationshipDraft(relationship ? {
      id: relationship.id,
      leftTableId: relationship.leftTableId,
      leftField: relationship.leftField,
      rightTableId: relationship.rightTableId,
      rightField: relationship.rightField,
      displayField: relationship.displayField ?? "",
    } : emptyRelationshipDraft());
  };
  const setRelationshipStatus = (relationship: TableRelationship, status: TableRelationship["status"]) =>
    setSession((prev) => updateSessionRelationship(prev, { ...relationship, status }));
  const saveRelationshipDraft = () => {
    if (!relationshipDraft || !draftEvaluation) return;
    const hasBlockingDiagnostics = draftEvaluation.diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
    const original = relationshipDraft.id
      ? session.relationships.find((relationship) => relationship.id === relationshipDraft.id)
      : undefined;
    const endpointsChanged = Boolean(original) && (
      original?.leftTableId !== relationshipDraft.leftTableId ||
      original?.leftField !== relationshipDraft.leftField ||
      original?.rightTableId !== relationshipDraft.rightTableId ||
      original?.rightField !== relationshipDraft.rightField
    );
    setSession((prev) => updateSessionRelationship(prev, {
      ...draftEvaluation,
      id: relationshipDraft.id && !endpointsChanged ? relationshipDraft.id : draftEvaluation.id,
      displayField: relationshipDraft.displayField || draftEvaluation.displayField,
      source: "manual",
      status: hasBlockingDiagnostics ? "suggested" : "confirmed",
    }));
    setRelationshipDraft(null);
  };
  const hasMultiTableRelationships = enhancedRelResult.relationships.length > 0;
  const hasBlockingCardinality =
    enhancedRelResult.blockingCardinalityIssues.length > 0 &&
    !session.relationshipDecisions.some((d) => d.confirmedCardinality);
  const hasCardinalityWarnings =
    enhancedRelResult.warningCardinalityIssues.length > 0;
  const hasQualityIssues = enhancedRelResult.qualityIssues.length > 0;
  const analysisPages = availableAnalysisPages(
    capabilities,
    session.files.length > 0,
  );
  const confirmCardinality = () =>
    setSession((prev) => {
      const existing = prev.relationshipDecisions.filter(
        (d) => d.key !== "__cardinality__",
      );
      return {
        ...prev,
        relationshipDecisions: [
          ...existing,
          { key: "__cardinality__", confirmedCardinality: true },
        ],
        confirmed: false,
      };
    });
  const updateRole = (fileId: string, role: FileRole) =>
    setSession((prev) => {
      const file = prev.files.find((item) => item.id === fileId);
      const mappings: FileMapping[] = prev.mappings.map((mapping) =>
        mapping.fileId === fileId
          ? {
              ...mapping,
              role,
              granularity: file
                ? recommendedGranularity(file, role)
                : mapping.granularity,
              confirmed: false,
            }
          : mapping,
      );
      return {
        ...prev,
        mappings,
        capabilities: buildMetricCapabilities(prev.files, mappings),
        confirmed: false,
      };
    });
  const updateGranularity = (fileId: string, granularity: RowGranularity) =>
    setSession((prev) => {
      const mappings: FileMapping[] = prev.mappings.map((mapping) =>
        mapping.fileId === fileId
          ? { ...mapping, granularity, confirmed: false }
          : mapping,
      );
      return { ...prev, mappings, confirmed: false };
    });
  const updateBehaviorValue = (
    fileId: string,
    raw: string,
    normalized: string,
  ) =>
    setSession((prev) => {
      const mappings = prev.mappings.map((mapping) =>
        mapping.fileId === fileId
          ? {
              ...mapping,
              behaviorValueMappings: {
                ...mapping.behaviorValueMappings,
                [raw]: normalized,
              },
              confirmed: false,
            }
          : mapping,
      );
      return { ...prev, mappings, confirmed: false };
    });
  const updateField = (fileId: string, source: string, canonical: string) =>
    setSession((prev) => {
      const mappings: FileMapping[] = prev.mappings.map((mapping) =>
        mapping.fileId === fileId
          ? {
              ...mapping,
              confirmed: false,
              fields: mapping.fields.map((field) =>
                field.source === source
                  ? {
                      ...field,
                      canonical,
                      confidence: "manual" as const,
                      dimensionType: canonical
                        ? undefined
                        : field.dimensionType,
                    }
                  : field,
              ),
            }
          : mapping,
      );
      return {
        ...prev,
        mappings,
        capabilities: buildMetricCapabilities(prev.files, mappings),
        confirmed: false,
      };
    });
  const clearFieldMapping = (fileId: string, source: string) =>
    updateField(fileId, source, "");
  const updateFieldDimensionType = (
    fileId: string,
    source: string,
    dimensionType: DimensionType,
  ) =>
    setSession((prev) => {
      const mappings: FileMapping[] = prev.mappings.map((mapping) =>
        mapping.fileId === fileId
          ? {
              ...mapping,
              confirmed: false,
              fields: mapping.fields.map((field) =>
                field.source === source ? { ...field, dimensionType } : field,
              ),
            }
          : mapping,
      );
      return { ...prev, mappings, confirmed: false };
    });
  const updateSingleTableType = (
    fileId: string,
    singleTableType: SingleTableType,
  ) =>
    setSession((prev) => {
      const mappings = prev.mappings.map((mapping) =>
        mapping.fileId === fileId
          ? { ...mapping, singleTableType, confirmed: false }
          : mapping,
      );
      return { ...prev, mappings, confirmed: false };
    });
  const resolveDuplicateRole = (
    role: FileRole,
    action: DuplicateRoleAction,
    fileId?: string,
  ) =>
    setSession((prev) => {
      const group = duplicateRoleGroups(prev.mappings).find(
        (item) => item.role === role,
      );
      if (!group) return prev;
      if (action === "cancel")
        return {
          ...prev,
          duplicateRoleDecisions: prev.duplicateRoleDecisions.filter(
            (decision) => decision.role !== role,
          ),
          confirmed: false,
        };
      if (action === "merge") {
        const merged = mergeRoleFiles(prev.files, prev.mappings, role);
        if (merged.error) return { ...prev, confirmed: false };
        return {
          ...prev,
          files: merged.files,
          mappings: merged.mappings,
          duplicateRoleDecisions: [
            ...prev.duplicateRoleDecisions.filter(
              (decision) => decision.role !== role,
            ),
            { role, action },
          ],
          capabilities: buildMetricCapabilities(merged.files, merged.mappings),
          confirmed: false,
        };
      }
      if (action === "replace" && fileId) {
        const mappings = prev.mappings.filter(
          (mapping) => mapping.role !== role || mapping.fileId === fileId,
        );
        const files = prev.files.filter((file) =>
          mappings.some((mapping) => mapping.fileId === file.id),
        );
        return {
          ...prev,
          files,
          mappings,
          duplicateRoleDecisions: prev.duplicateRoleDecisions.filter(
            (decision) => decision.role !== role,
          ),
          capabilities: buildMetricCapabilities(files, mappings),
          confirmed: false,
        };
      }
      return {
        ...prev,
        duplicateRoleDecisions: [
          ...prev.duplicateRoleDecisions.filter(
            (decision) => decision.role !== role,
          ),
          { role, action, fileId },
        ],
        confirmed: false,
      };
    });
  const confirmMappings = () => {
    if (
      hasBlockingFiles ||
      hasQualityErrors ||
      hasGranularityErrors ||
      hasDuplicateMappings ||
      hasModelErrors ||
      hasSingleTableErrors ||
      hasUnresolvedDuplicateRoles ||
      hasSeparateDuplicateRoles
    )
      return;
    setSession((prev) => ({
      ...prev,
      confirmed: true,
      capabilities: buildMetricCapabilities(prev.files, prev.mappings),
      mappings: prev.mappings.map((mapping) => ({
        ...mapping,
        confirmed: true,
      })),
    }));
  };
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">SCHEMA CHECK · FIELD MAP</span>
          <h1>字段确认</h1>
          <p>
            系统只显示本次上传的文件和表头，请确认角色与字段映射后再生成经营指标。
          </p>
        </div>
        <button onClick={() => onOpen("字段确认说明")}>查看说明</button>
      </header>
      {session.files.length === 0 ? (
        <section className="panel schema-empty">
          <strong>还没有可确认的文件</strong>
          <p>请先返回数据导入页，上传并完成解析 CSV 文件。</p>
          <button className="primary-button" onClick={onBack}>
            返回上传文件
          </button>
        </section>
      ) : (
        <>
          {summaryError && (
            <section className="panel import-runtime-error">
              <strong>{"导入摘要暂时不可用"}</strong>
              <span>{summaryError}</span>
              <button className="secondary-button" onClick={onBack}>
                {"返回上传"}
              </button>
            </section>
          )}
          <section className="schema-summary">
            <div>
              <span className="section-kicker">结构检查</span>
              <h2>
                {confirmed
                  ? "字段已确认，可以进入真实看板"
                  : hasBlockingFiles
                    ? "仍有文件未完成读取"
                    : "请确认文件角色与字段"}
              </h2>
              <p>
                {confirmed
                  ? "当前上传文件已接入指标计算。可用指标和图表取决于已映射的字段。"
                  : hasBlockingFiles
                    ? "请返回上传页处理读取中或读取失败的文件。"
                    : hasGranularityErrors
                      ? "请先修正行粒度与文件角色的冲突。"
                      : hasDuplicateMappings
                        ? "请先处理同一文件内的重复标准字段映射。"
                        : hasModelErrors
                          ? "请先补齐角色必需字段或修复唯一标识。"
                          : hasSingleTableErrors
                            ? "请先选择或修正单表类型。"
                            : hasUnresolvedDuplicateRoles
                              ? "请先处理重复角色文件。"
                              : hasSeparateDuplicateRoles
                                ? "已选择分别作为不同数据集，请先进入数据集拆分流程。"
                                : hasBlockingCardinality
                                  ? "请先处理多对多关系，确认或修改基数。"
                                  : "请先回答每行代表什么，再确认文件角色与字段映射。"}
              </p>
            </div>
            <div className={confirmed ? "check-ring done" : "check-ring"}>
              {confirmed ? "✓" : roles.length}
            </div>
          </section>
          {hasDuplicateMappings && (
            <section className="panel duplicate-mapping-block">
              <strong>发现重复标准字段</strong>
              <span>
                同一文件中的两列不能在没有转换说明的情况下映射为同一个标准字段。
              </span>
              {duplicateMappings.map((item) => (
                <div
                  key={item.file.id + item.canonical}
                  className="duplicate-mapping-row"
                >
                  <b>{item.file.name}</b>
                  <span>
                    {item.sources.join("、")} →{" "}
                    {canonicalDisplay(item.canonical)}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      clearFieldMapping(
                        item.file.id,
                        item.sources[item.sources.length - 1],
                      )
                    }
                  >
                    取消后一列映射
                  </button>
                </div>
              ))}
            </section>
          )}
          {hasModelErrors && (
            <section className="panel model-validation-block">
              <strong>角色字段校验未通过</strong>
              <span>
                缺少角色必需字段或维度表唯一标识时，不能确认当前数据模型。
              </span>
              {modelValidation.issues.map((issue) => (
                <div
                  key={issue.key + issue.fileId}
                  className="model-validation-row"
                >
                  <b>{issue.fileName}</b>
                  <span>{issue.detail}</span>
                </div>
              ))}
            </section>
          )}
          <>
            {unresolvedDuplicateRoles.map((group) => (
              <section className="panel duplicate-role-block" key={group.role}>
                <strong>发现重复角色文件：{roleLabel[group.role]}</strong>
                <span>
                  请先选择处理方式，确认前不会使用其中任意一张作为默认数据。
                </span>
                <div className="duplicate-role-files">
                  {group.fileIds.map((fileId) => (
                    <span key={fileId}>
                      {session.files.find((file) => file.id === fileId)?.name ??
                        fileId}
                    </span>
                  ))}
                </div>
                {(() => {
                  const preview = buildMergePreview(
                    session.files,
                    session.mappings,
                    group.role,
                  );
                  if (!preview) return null;
                  return (
                    <div className="merge-preview">
                      <strong>
                        {"合并预览：" +
                          preview.files.length +
                          " 个文件 → " +
                          preview.totalRows +
                          " 行"}
                      </strong>
                      <div className="merge-preview-files">
                        {preview.files.map((f) => (
                          <span key={f.name}>
                            {f.name + "（" + f.rows + " 行）"}
                          </span>
                        ))}
                      </div>
                      <span className="merge-preview-headers">
                        共用列：{preview.commonHeaders.slice(0, 8).join("、")}
                        {preview.commonHeaders.length > 8
                          ? " …共 " + preview.commonHeaders.length + " 列"
                          : ""}
                      </span>
                      {preview.extraHeaders.length > 0 &&
                        preview.extraHeaders.map((e) => (
                          <div key={e.file} className="merge-preview-warning">
                            {"⚠ " +
                              e.file +
                              " 独有列：" +
                              e.headers.join("、")}
                          </div>
                        ))}
                      {preview.missingHeaders.length > 0 &&
                        preview.missingHeaders.map((e) => (
                          <div key={e.file} className="merge-preview-error">
                            {"✗ " + e.file + " 缺失列：" + e.headers.join("、")}
                          </div>
                        ))}
                      {preview.issue && (
                        <span className="merge-preview-issue">
                          {preview.issue}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="duplicate-role-actions">
                  <button
                    className="secondary-button"
                    onClick={() => resolveDuplicateRole(group.role, "merge")}
                  >
                    纵向合并
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => resolveDuplicateRole(group.role, "separate")}
                  >
                    分别作为不同数据集
                  </button>
                  <label className="replace-role-control">
                    替换为
                    <select
                      onChange={(event) =>
                        resolveDuplicateRole(
                          group.role,
                          "replace",
                          event.target.value,
                        )
                      }
                      defaultValue=""
                    >
                      <option value="" disabled>
                        选择保留文件
                      </option>
                      {group.fileIds.map((fileId) => (
                        <option key={fileId} value={fileId}>
                          {session.files.find((file) => file.id === fileId)
                            ?.name ?? fileId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => resolveDuplicateRole(group.role, "cancel")}
                  >
                    取消处理
                  </button>
                </div>
              </section>
            ))}
          </>
          <>
            {hasSeparateDuplicateRoles && (
              <section className="panel duplicate-role-block separate-block">
                <strong>已选择分别作为不同数据集</strong>
                <span>
                  {separateDuplicateRoles.join("、")}{" "}
                  当前不能在单一数据集确认页继续计算。请完成数据集拆分后再确认，避免系统按上传顺序默认取第一张表。
                </span>
              </section>
            )}
          </>
          <>
            {hasSingleTableErrors && (
              <section className="panel model-validation-block">
                <strong>单表类型需要确认</strong>
                <span>
                  系统无法可靠判断这张表的类型，请先选择；类型与角色冲突时也不能继续。
                </span>
                {singleTableIssues.map((issue) => (
                  <div key={issue} className="model-validation-row">
                    <b>请处理</b>
                    <span>{issue}</span>
                  </div>
                ))}
              </section>
            )}
          </>
          <section className="schema-list">
            {roles.map(({ file, mapping }) => {
              const role = mapping?.role ?? "unknown";
              const blocked =
                file.status === "reading" ||
                file.status === "queued" ||
                file.status === "error";
              const fields = mapping?.fields ?? [];
              const visibleFields = fields.filter(
                (field) => field.canonical || field.confidence !== "low",
              );
              const ignoredFields = fields.filter(
                (field) => !field.canonical && field.confidence === "low",
              );
              return (
                <article className="panel schema-card" key={file.id}>
                  <div className="schema-top">
                    <div>
                      <span className="file-icon">.csv</span>
                      <div className="schema-file">
                        <strong>{file.name}</strong>
                        <small>
                          {blocked
                            ? file.error || "文件尚未完成解析"
                            : `识别为 ${roleLabel[role]}`}
                        </small>
                      </div>
                    </div>
                    <span
                      className={
                        blocked || role === "unknown"
                          ? "confidence"
                          : "confidence high"
                      }
                    >
                      {blocked
                        ? "不可确认"
                        : role === "unknown"
                          ? "待确认"
                          : "已推荐"}
                    </span>
                  </div>
                  <div className="role-select">
                    <label>
                      每行代表
                      <select
                        disabled={blocked}
                        value={mapping?.granularity ?? "custom"}
                        onChange={(event) =>
                          updateGranularity(
                            file.id,
                            event.target.value as RowGranularity,
                          )
                        }
                      >
                        {granularityOptions.map((option) => (
                          <option key={option} value={option}>
                            {rowGranularityLabel[option]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="granularity-hint">
                      {mapping
                        ? rowGranularityDescription[mapping.granularity]
                        : "请先完成文件解析。"}
                    </p>
                    <label>
                      单表类型
                      <select
                        disabled={blocked}
                        value={
                          mapping?.singleTableType ??
                          detectSingleTableType(file)
                        }
                        onChange={(event) =>
                          updateSingleTableType(
                            file.id,
                            event.target.value as SingleTableType,
                          )
                        }
                      >
                        <option value="unknown">待选择</option>
                        <option value="behavior">用户行为单表</option>
                        <option value="order">订单主表单表</option>
                        <option value="order_items">订单明细单表</option>
                        <option value="order_wide">订单宽表</option>
                      </select>
                    </label>
                    <p className="single-table-type-hint">
                      {
                        singleTableTypeDescription[
                          mapping?.singleTableType ??
                            detectSingleTableType(file)
                        ]
                      }
                    </p>
                    <label>
                      文件角色
                      <select
                        disabled={blocked}
                        value={role}
                        onChange={(event) =>
                          updateRole(file.id, event.target.value as FileRole)
                        }
                      >
                        <option value="unknown">未知角色</option>
                        <option value="behavior">用户行为明细表</option>
                        <option value="orders">订单主表</option>
                        <option value="order_items">订单商品明细</option>
                        <option value="products">商品表</option>
                        <option value="dimension">维度/字典表</option>
                        <option value="users">用户表</option>
                        <option value="refunds">退款表</option>
                      </select>
                    </label>
                    {mapping &&
                      granularityConflict(role, mapping.granularity) && (
                        <div className="granularity-conflict">
                          <strong>粒度与角色不一致</strong>
                          <span>
                            {granularityConflict(role, mapping.granularity)}
                          </span>
                        </div>
                      )}
                    <div className="field-mapping-list">
                      {visibleFields.map((field) => (
                        <div className="field-mapping" key={field.source}>
                          <span title={field.source}>{field.source}</span>
                          <select
                            disabled={blocked}
                            value={field.canonical}
                            onChange={(event) =>
                              updateField(
                                file.id,
                                field.source,
                                event.target.value,
                              )
                            }
                          >
                            {canonicalOptions.map((option) => {
                              const usedByOther = Boolean(
                                option &&
                                  (mapping?.fields ?? []).some(
                                    (other) =>
                                      other.source !== field.source &&
                                      other.canonical === option,
                                  ),
                              );
                              return (
                                <option
                                  key={option}
                                  value={option}
                                  disabled={usedByOther}
                                >
                                  {canonicalLabels[option]}
                                  {usedByOther ? "（已被其他列使用）" : ""}
                                </option>
                              );
                            })}
                          </select>
                          {!field.canonical && (
                            <select
                              disabled={blocked}
                              value={field.dimensionType ?? "text"}
                              onChange={(event) =>
                                updateFieldDimensionType(
                                  file.id,
                                  field.source,
                                  event.target.value as DimensionType,
                                )
                              }
                            >
                              {dimensionTypeOptions.map((option) => (
                                <option key={option} value={option}>
                                  {dimensionTypeLabels[option]}
                                </option>
                              ))}
                            </select>
                          )}
                          <em className={field.confidence}>
                            {field.confidence === "manual"
                              ? "已修改"
                              : field.confidence === "high"
                                ? "推荐"
                                : "未识别"}
                          </em>
                        </div>
                      ))}
                    </div>
                    {ignoredFields.length > 0 && (
                      <details className="other-fields">
                        <summary>其他字段 ({ignoredFields.length})</summary>
                        <p>未映映映字段默数该指标计算。可展开恢复映射。</p>
                        <div className="field-mapping-list">
                          {ignoredFields.map((field) => (
                            <div className="field-mapping" key={field.source}>
                              <span title={field.source}>{field.source}</span>
                              <select
                                disabled={blocked}
                                value={field.canonical}
                                onChange={(event) =>
                                  updateField(
                                    file.id,
                                    field.source,
                                    event.target.value,
                                  )
                                }
                              >
                                {canonicalOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {canonicalLabels[option]}
                                  </option>
                                ))}
                              </select>
                              <em className={field.confidence}>未识别</em>
                              <details className="field-sample">
                                <summary>样例</summary>
                                <span>
                                  {(file.preview?.rows ?? [])
                                    .slice(0, 3)
                                    .map(
                                      (row) =>
                                        row[
                                          file.preview?.headers.indexOf(
                                            field.source,
                                          ) ?? -1
                                        ],
                                    )
                                    .filter(Boolean)
                                    .join(", ") || "暂无样例值"}
                                </span>
                              </details>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
          {capabilities.some((capability) => !capability.available) && (
            <details className="capability-panel panel" open>
              <summary className="capability-summary">
                <span>
                  <span className="section-kicker">DATA DIAGNOSTICS</span>
                  <strong>数据诊断</strong>
                </span>
                <small>展开查看不可用指标及补齐方式</small>
              </summary>
            <div className="panel-head">
              <div>
                <span className="section-kicker">DATA DIAGNOSTICS</span>
                <h2>不可用指标</h2>
              </div>
              <span className="capability-note">
                确认页、导航和看板共用此结果
              </span>
            </div>
            <div className="capability-page-list">
              <span className="capability-note">本次可生成页面：</span>
              {analysisPages.map((page) => (
                <span className="capability-page-chip" key={page.key}>
                  {page.label}
                </span>
              ))}
            </div>
            <div className="capability-list">
              {capabilities.filter((capability) => !capability.available).map((capability) => (
                <div className="capability-row" key={capability.key}>
                  <span
                    className={
                      capability.available
                        ? "capability-dot available"
                        : "capability-dot"
                    }
                  >
                    {capability.available ? "✓" : "—"}
                  </span>
                  <div>
                    <strong>{capability.label}</strong>
                    <small>
                      {capability.available ? "可直接计算" : capability.reason}
                    </small>
                    <div className="capability-definition">
                      <span>状态：{capabilityStatus(capability)}</span>
                      <span>来源：{capability.definition.source}</span>
                      <span>粒度：{capability.definition.granularity}</span>
                      <span>公式：{capability.definition.formula}</span>
                      <span>去重键：{capability.definition.dedupKey}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </details>
          )}
          {behaviorSummary && (
            <section className="panel behavior-summary">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">用户行为单表</span>
                  <h2>计算结果</h2>
                </div>
                <span className="capability-note">
                  仅统计 behavior = buy；漏斗按行为值分布统计
                </span>
              </div>
              <div className="behavior-metrics">
                <div>
                  <span>GMV</span>
                  <strong>
                    {behaviorSummary.gmv === null
                      ? "暂无数据"
                      : "¥" + money(behaviorSummary.gmv)}
                  </strong>
                </div>
                <div>
                  <span>购买件数</span>
                  <strong>{money(behaviorSummary.purchasedUnits)}</strong>
                </div>
                <div>
                  <span>购买用户数</span>
                  <strong>{money(behaviorSummary.purchasingUsers)}</strong>
                </div>
                <div>
                  <span>购买行为数</span>
                  <strong>{money(behaviorSummary.purchaseBehaviors)}</strong>
                </div>
              </div>
              <div className="behavior-values">
                <div className="behavior-values-head">
                  <strong>行为值分布</strong>
                  <span>请确认哪些值代表浏览、收藏、加购和购买</span>
                </div>
                {behaviorSummary.behaviorValues.map((item) => (
                  <div className="behavior-value-row" key={item.raw}>
                    <span>{item.raw}</span>
                    <b>{item.count} 行</b>
                    <select
                      className="behavior-value-select"
                      value={
                        behaviorEntry?.mapping?.behaviorValueMappings[
                          item.raw
                        ] ?? item.normalized
                      }
                      onChange={(event) =>
                        updateBehaviorValue(
                          behaviorEntry?.file.id ?? "",
                          item.raw,
                          event.target.value,
                        )
                      }
                    >
                      <option value="pv">浏览</option>
                      <option value="fav">收藏</option>
                      <option value="cart">加购</option>
                      <option value="buy">购买</option>
                      <option value="ignore">忽略</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="funnel-summary">
                <span>行为漏斗</span>
                {behaviorSummary.funnel.map((step, index) => (
                  <div key={step.key}>
                    <b>{step.label}</b>
                    <strong>{step.value}</strong>
                    {index < behaviorSummary.funnel.length - 1 && <i>{"→"}</i>}
                  </div>
                ))}
              </div>
              <p className="behavior-note">
                当前文件没有 order_id，因此“购买行为数”不代表真实订单量。GMV
                需要同时有 price 和 amount；缺少时仅关闭
                GMV，不影响行为漏斗。address、sex、device
                已支持作为分析维度映射。
              </p>
            </section>
          )}
          {orderSummary && !orderWideSummary && (
            <section className="panel relation-summary">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">
                    {isOrderSingleTable ? "订单主表单表" : "订单多表模式"}
                  </span>
                  <h2>{isOrderSingleTable ? "计算结果" : "表关系检查"}</h2>
                </div>
                <span className="capability-note">
                  {isOrderSingleTable
                    ? "仅订单主表，无商品明细"
                    : "GMV 按订单主表去重"}
                </span>
              </div>
              <div className="relation-metrics">
                <div>
                  <span>订单量</span>
                  <strong>{money(orderSummary.orderCount)}</strong>
                </div>
                <div>
                  <span>订单 GMV</span>
                  <strong>
                    {"¥"}
                    {money(orderSummary.orderGmv)}
                  </strong>
                </div>
                <div>
                  <span>客单价</span>
                  <strong>
                    {orderSummary.averageOrderValue === null
                      ? "暂无数据"
                      : "¥" + money(orderSummary.averageOrderValue)}
                  </strong>
                </div>
                <div>
                  <span>购买用户数</span>
                  <strong>{money(orderSummary.purchasingUsers)}</strong>
                </div>
                {!isOrderSingleTable && (
                  <div>
                    <span>明细行数</span>
                    <strong>{money(orderSummary.itemCount)}</strong>
                  </div>
                )}
                {!isOrderSingleTable && (
                  <div>
                    <span>退款金额</span>
                    <strong>
                      {"¥"}
                      {money(orderSummary.refundAmount)}
                    </strong>
                  </div>
                )}
                {!isOrderSingleTable && (
                  <div>
                    <span>退款订单数</span>
                    <strong>{money(orderSummary.refundOrderCount)}</strong>
                  </div>
                )}
                {!isOrderSingleTable && (
                  <div>
                    <span>金额退款率</span>
                    <strong>
                      {orderSummary.refundAmountRate === null
                        ? "暂无数据"
                        : `${orderSummary.refundAmountRate.toFixed(2)}%`}
                    </strong>
                  </div>
                )}
                {!isOrderSingleTable && (
                  <div>
                    <span>订单退款率</span>
                    <strong>
                      {orderSummary.refundOrderRate === null
                        ? "暂无数据"
                        : `${orderSummary.refundOrderRate.toFixed(2)}%`}
                    </strong>
                  </div>
                )}
              </div>
              {!isOrderSingleTable && (
                <div className="relationship-list">
                  {orderSummary.relationships.map((relation) => (
                    <div key={relation.key}>
                      <b>{relation.label}</b>
                      <span
                        className={
                          relation.available
                            ? "relation-ok"
                            : "relation-warning"
                        }
                      >
                        {relation.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {orderSummary.warning && (
                <p className="relation-warning-text">
                  数据质量警告：{orderSummary.warning}
                </p>
              )}
              <p className="behavior-note">
                订单量、GMV、客单价和购买用户数来自订单主表；订单 GMV 按
                order_id 去重。
                {isOrderSingleTable
                  ? "没有订单明细时，商品排行不可用。"
                  : "退款金额按 refund_amount 逐行汇总；金额退款率 = 退款金额 / 订单 GMV；订单退款率 = 去重退款订单数 / 去重支付订单数。一笔订单多次退款时，退款金额逐笔累加（不加权合并），退款订单数按 order_id 去重仅计 1 次。"}
                {hasChannelCapability &&
                  "已识别 channel 字段，可在渠道贡献中查看。"}
                {hasRepeatRateCapability &&
                  "已识别 user_id 和日期字段，可计算复购率。"}
              </p>
            </section>
          )}
          {orderItemsSummary && !orderSummary && !orderWideSummary && (
            <section className="panel relation-summary">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">订单明细单表</span>
                  <h2>计算结果</h2>
                </div>
                <span className="capability-note">
                  明细销售额 = price × amount，不按订单去重
                </span>
              </div>
              <div className="relation-metrics">
                <div>
                  <span>明细销售额</span>
                  <strong>
                    {"¥"}
                    {money(orderItemsSummary.detailSales)}
                  </strong>
                </div>
                <div>
                  <span>商品销售总量</span>
                  <strong>
                    {money(orderItemsSummary.productSalesVolume)}
                    {"件"}
                  </strong>
                </div>
                {orderItemsSummary.hasOrderId && (
                  <div>
                    <span>去重订单量</span>
                    <strong>{money(orderItemsSummary.orderCount ?? 0)}</strong>
                  </div>
                )}
                {orderItemsSummary.hasUserId && (
                  <div>
                    <span>购买用户数</span>
                    <strong>
                      {money(orderItemsSummary.purchasingUsers ?? 0)}
                    </strong>
                  </div>
                )}
                <div>
                  <span>商品数</span>
                  <strong>{orderItemsSummary.productRank.length}</strong>
                </div>
                {orderItemsSummary.orderDateRange && (
                  <div>
                    <span>时间范围</span>
                    <strong>
                      {orderItemsSummary.orderDateRange.start}
                      {"~"}
                      {orderItemsSummary.orderDateRange.end}
                    </strong>
                  </div>
                )}
              </div>
              {orderItemsSummary.productRank.length > 0 && (
                <details className="product-rank-details">
                  <summary>
                    商品排行（前{" "}
                    {Math.min(orderItemsSummary.productRank.length, 10)}）
                  </summary>
                  <div className="product-rank-list">
                    {orderItemsSummary.productRank
                      .slice(0, 10)
                      .map((item, index) => (
                        <div key={item.productId} className="product-rank-row">
                          <span>{index + 1}</span>
                          <span>{item.productId}</span>
                          <span>
                            {money(item.salesVolume)}
                            {"件"}
                          </span>
                          <span>
                            {"¥"}
                            {money(item.salesAmount)}
                          </span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
              <p className="behavior-note">
                明细销售额为所有订单商品行的 price × amount 之和，不是订单实付
                GMV。
                {!orderItemsSummary.hasUserId &&
                  "没有 user_id，购买用户数和复购率不可用。"}
                {orderItemsSummary.hasOrderId
                  ? "已按 order_id 去重计算订单量。"
                  : "没有 order_id，无法计算去重订单量。"}
              </p>
            </section>
          )}
          {orderWideSummary && (
            <section className="panel relation-summary">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">订单宽表</span>
                  <h2>计算结果</h2>
                </div>
                <span className="capability-note">
                  同时包含订单主表和商品明细信息
                </span>
              </div>
              <div className="relation-metrics">
                <div>
                  <span>订单量</span>
                  <strong>{money(orderWideSummary.orderCount)}</strong>
                </div>
                <div>
                  <span>订单 GMV</span>
                  <strong>
                    {"¥"}
                    {money(orderWideSummary.orderGmv)}
                  </strong>
                </div>
                <div>
                  <span>客单价</span>
                  <strong>
                    {orderWideSummary.averageOrderValue === null
                      ? "暂无数据"
                      : "¥" + money(orderWideSummary.averageOrderValue)}
                  </strong>
                </div>
                {orderWideSummary.hasUserId && (
                  <div>
                    <span>购买用户数</span>
                    <strong>
                      {money(orderWideSummary.purchasingUsers ?? 0)}
                    </strong>
                  </div>
                )}
                <div>
                  <span>明细销售额</span>
                  <strong>
                    {"¥"}
                    {money(orderWideSummary.detailSales)}
                  </strong>
                </div>
                <div>
                  <span>商品销售总量</span>
                  <strong>
                    {money(orderWideSummary.productSalesVolume)}
                    {"件"}
                  </strong>
                </div>
                <div>
                  <span>商品数</span>
                  <strong>{orderWideSummary.productRank.length}</strong>
                </div>
                <div>
                  <span>总行数</span>
                  <strong>{money(orderWideSummary.totalRows)}</strong>
                </div>
              </div>
              {orderWideSummary.productRank.length > 0 && (
                <details className="product-rank-details">
                  <summary>
                    商品排行（前{" "}
                    {Math.min(orderWideSummary.productRank.length, 10)}）
                  </summary>
                  <div className="product-rank-list">
                    {orderWideSummary.productRank
                      .slice(0, 10)
                      .map((item, index) => (
                        <div key={item.productId} className="product-rank-row">
                          <span>{index + 1}</span>
                          <span>{item.productId}</span>
                          <span>
                            {money(item.salesVolume)}
                            {"件"}
                          </span>
                          <span>
                            {"¥"}
                            {money(item.salesAmount)}
                          </span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
              {orderWideSummary.warning && (
                <p className="relation-warning-text">
                  数据质量警告：{orderWideSummary.warning}
                </p>
              )}
              {orderWideSummary.error && (
                <p
                  className="relation-warning-text"
                  style={{ color: "var(--color-error)" }}
                >
                  <strong>数据冲突：</strong>
                  {orderWideSummary.error}
                </p>
              )}
              <p className="behavior-note">
                订单宽表同时包含订单主表和商品明细信息。订单量、GMV 和客单价按
                order_id 去重；明细销售额为所有行的 price × amount
                之和，不是订单实付 GMV。
                {!orderWideSummary.hasUserId &&
                  " 没有 user_id，购买用户数不可用。"}
                {orderWideSummary.hasAmountConflict &&
                  " 检测到同一订单存在不同 order_amount，这是数据质量问题。"}
              </p>
            </section>
          )}
          <section className="panel data-relationship-panel">
            <div className="panel-head">
              <div>
                <span className="section-kicker">DATA RELATIONSHIPS</span>
                <h2>数据关系</h2>
                <p className="relationship-intro">系统只提供可核对的建议。确认后关系才能用于正式分析；未匹配值仍保留原始 ID。</p>
              </div>
              <button className="secondary-button" onClick={() => openRelationshipDraft()}>手动新增关系</button>
            </div>
            {session.tables.length > 1 && !session.performanceDiagnostics.some((item) => item.key === "relationship-discovery") && (
              <LoadingNotice label="正在分析数据关系，请耐心等待…" />
            )}
            {!workerQuality && session.files.some((file) => file.status === "ready" || file.status === "warning") && (
              <LoadingNotice label="正在检查数据质量，请耐心等待…" />
            )}
            {session.relationships.length === 0 ? (
              <div className="relationship-empty">
                <strong>暂未发现可用关系</strong>
                <span>可以先调整字段映射，或手动指定两张表的连接字段。</span>
              </div>
            ) : (
              <div className="relationship-workbench">
                {session.relationships.map((relationship) => {
                  const leftTable = tableById(relationship.leftTableId);
                  const rightTable = tableById(relationship.rightTableId);
                  const manualDiagnostics = relationship.source === "manual"
                    ? evaluateManualRelationship(session.tables, relationship)?.diagnostics ?? []
                    : [];
                  const diagnostics = relationshipDiagnosticMap.get(relationship.id) ?? manualDiagnostics;
                  const blocking = diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
                  return (
                    <article className={`relationship-card status-${relationship.status}`} key={relationship.id}>
                      <div className="relationship-card-head">
                        <span className={`relationship-status ${blocking ? "blocking" : relationship.status}`}>{blocking ? "存在风险" : relationship.status === "confirmed" ? "已确认" : relationship.status === "rejected" ? "已忽略" : relationship.status === "disabled" ? "已停用" : "待确认"}</span>
                        <span className="relationship-source">{relationship.source === "manual" ? "手动配置" : `自动建议 · 置信度 ${(relationship.confidence * 100).toFixed(0)}%`}</span>
                      </div>
                      <div className="relationship-track">
                        <div className="relationship-node"><strong>{leftTable?.name ?? relationship.leftTableId}</strong><span>{relationship.leftField}</span></div>
                        <div className="relationship-rail">
                          <b>{relationship.cardinality === "many-to-one" ? "多对一" : "一对一"}</b>
                          <i><span style={{ width: `${relationship.matchRate * 100}%` }} /></i>
                          <small>匹配 {(relationship.matchRate * 100).toFixed(1)}% · 右键唯一 {(relationship.rightKeyUniqueness * 100).toFixed(1)}%</small>
                        </div>
                        <div className="relationship-node"><strong>{rightTable?.name ?? relationship.rightTableId}</strong><span>{relationship.rightField}</span></div>
                      </div>
                      {relationship.displayField && <p className="relationship-display-field">展示名称：<b>{relationship.displayField}</b></p>}
                      {diagnostics.length > 0 && <div className="relationship-diagnostics">{diagnostics.map((diagnostic, index) => <span className={diagnostic.severity} key={`${diagnostic.code}-${index}`}>{diagnostic.message}{diagnostic.samples.length ? ` 示例：${diagnostic.samples.join("、")}` : ""}</span>)}</div>}
                      <div className="relationship-actions">
                        {relationship.status !== "confirmed" && <button className="primary-button" disabled={blocking} onClick={() => setRelationshipStatus(relationship, "confirmed")}>确认使用</button>}
                        <button className="secondary-button" onClick={() => openRelationshipDraft(relationship)}>修改</button>
                        {relationship.status !== "rejected" && <button className="text-button" onClick={() => setRelationshipStatus(relationship, "rejected")}>忽略</button>}
                        {relationship.status === "confirmed" && <button className="text-button" onClick={() => setRelationshipStatus(relationship, "disabled")}>停用</button>}
                        {relationship.source === "manual" && <button className="text-button danger" onClick={() => setSession((prev) => removeSessionRelationship(prev, relationship.id))}>删除</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          {hasMultiTableRelationships && (
            <section className="panel relation-map-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">表关系确认</span>
                  <h2>关系映射与基数</h2>
                </div>
                <span className="capability-note">
                  可视化展示表之间的连接关系
                </span>
              </div>
              <div className="relation-map">
                {enhancedRelResult.relationships.map((rel) => (
                  <div key={rel.key} className="relation-map-row">
                    <div className="relation-map-tables">
                      <span className="relation-table-node">
                        {rel.leftTableName}
                      </span>
                      <span className="relation-connector">
                        <i className="cardinality-badge">{rel.cardinality}</i>
                        <span className="relation-field">
                          {rel.leftField} → {rel.rightField}
                        </span>
                        <div className="relation-match-bar">
                          <div
                            className="relation-match-fill"
                            style={{ width: rel.matchRate * 100 + "%" }}
                          ></div>
                        </div>
                        <span className="relation-match-text">
                          {rel.matched}/{rel.totalLeft} 匹配（
                          {(rel.matchRate * 100).toFixed(0)}%）
                        </span>
                      </span>
                      <span className="relation-table-node">
                        {rel.rightTableName}
                      </span>
                    </div>
                    <div className="relation-map-details">
                      <span>
                        {rel.totalLeft} 行 × {rel.totalRight} 行
                      </span>
                      {rel.leftHasEmpty && (
                        <span className="relation-warning">
                          左空键 {rel.leftEmptyCount}
                        </span>
                      )}
                      {rel.rightHasEmpty && (
                        <span className="relation-warning">
                          右空键 {rel.rightEmptyCount}
                        </span>
                      )}
                      {rel.cardinality === "n:m" &&
                        !session.relationshipDecisions.some(
                          (d) => d.confirmedCardinality,
                        ) && (
                          <button
                            className="text-button"
                            onClick={confirmCardinality}
                          >
                            确认允许多对多
                          </button>
                        )}
                      {rel.unmatchedLeftSamples.length > 0 && (
                        <details className="unmatched-details">
                          <summary>
                            左侧未匹配示例（{rel.unmatchedLeftSamples.length}）
                          </summary>
                          <span>{rel.unmatchedLeftSamples.join("、")}</span>
                        </details>
                      )}
                      {rel.unmatchedRightSamples.length > 0 && (
                        <details className="unmatched-details">
                          <summary>
                            右侧未匹配示例（{rel.unmatchedRightSamples.length}）
                          </summary>
                          <span>{rel.unmatchedRightSamples.join("、")}</span>
                        </details>
                      )}
                      {rel.impactMetrics.length > 0 && (
                        <span className="impact-metrics">
                          影响指标：{rel.impactMetrics.join("、")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {enhancedRelResult.blockingCardinalityIssues.length > 0 && (
                <div className="relation-map-blockers">
                  {enhancedRelResult.blockingCardinalityIssues.map(
                    (issue, i) => (
                      <div key={i} className="relation-blocking">
                        <strong>基数阻断：</strong>
                        <span>{issue}</span>
                        {!session.relationshipDecisions.some(
                          (d) => d.confirmedCardinality,
                        ) && (
                          <button
                            className="secondary-button"
                            onClick={confirmCardinality}
                          >
                            我了解风险，继续
                          </button>
                        )}
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>
          )}
          {hasMultiTableRelationships &&
            (hasBlockingCardinality ||
              hasCardinalityWarnings ||
              hasQualityIssues) && (
              <section className="panel quality-summary">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">关系质量</span>
                    <h2>外键质量报告</h2>
                  </div>
                  <span
                    className={
                      hasBlockingCardinality
                        ? "quality-count error"
                        : hasQualityIssues
                          ? "quality-count"
                          : "quality-count"
                    }
                  >
                    {hasBlockingCardinality
                      ? "存在阻断"
                      : hasQualityIssues
                        ? "存在警告"
                        : "正常"}
                  </span>
                </div>
                <div className="quality-list">
                  {enhancedRelResult.blockingCardinalityIssues.map(
                    (issue, i) => (
                      <div key={"b" + i}>
                        <b className="error">阻断</b>
                        <strong>基数阻断</strong>
                        <span>{issue}</span>
                      </div>
                    ),
                  )}
                  {enhancedRelResult.warningCardinalityIssues.map(
                    (issue, i) => (
                      <div key={"w" + i}>
                        <b className="warning">警告</b>
                        <strong>基数警告</strong>
                        <span>{issue}</span>
                      </div>
                    ),
                  )}
                  {enhancedRelResult.qualityIssues.map((issue, i) => (
                    <div key={"q" + i}>
                      <b className="warning">警告</b>
                      <strong>外键质量</strong>
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          <section className="panel quality-summary">
            <div className="panel-head">
              <div>
                <span className="section-kicker">数据质量</span>
                <h2>数据质量摘要</h2>
              </div>
              <span
                className={
                  quality.errorCount ? "quality-count error" : "quality-count"
                }
              >
                {quality.errorCount ? "存在错误" : "可继续"}
              </span>
            </div>
            <div className="quality-metrics">
              <div>
                <span>数据行数</span>
                <strong>{money(quality.totalRows)}</strong>
              </div>
              <div>
                <span>错误</span>
                <strong>{quality.errorCount}</strong>
              </div>
              <div>
                <span>警告</span>
                <strong>{quality.warningCount}</strong>
              </div>
              <div>
                <span>时间范围</span>
                <strong>{quality.timeRanges.length}</strong>
              </div>
            </div>
            {quality.issues.length ? (
              <div className="quality-list">
                {quality.issues.map((issue, index) => (
                  <div key={issue.label + index}>
                    <b className={issue.severity}>
                      {issue.severity === "error" ? "错误" : "警告"}
                    </b>
                    <strong>{issue.label}</strong>
                    <span>{issue.detail}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quality-clear">
                未发现空值、重复行、日期或金额异常。
              </p>
            )}
          </section>
          {session.performanceDiagnostics.length > 0 && (
            <section className="panel performance-summary">
              <div className="panel-head"><div><span className="section-kicker">PERFORMANCE</span><h2>性能与规模诊断</h2></div></div>
              <div className="performance-diagnostic-list">
                {session.performanceDiagnostics.map((diagnostic) => (
                  <div className={diagnostic.severity} key={`${diagnostic.key}-${diagnostic.generatedAt}`}>
                    <strong>{diagnostic.severity === "error" ? "需处理" : diagnostic.severity === "warning" ? "较慢" : "正常"}</strong>
                    <span>{diagnostic.message}</span>
                    {diagnostic.durationMs !== undefined && <small>{diagnostic.durationMs.toFixed(0)} ms</small>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {confirmed && (
            <section className="import-status">
              <strong>字段已确认，可以进入真实看板</strong>
              <span>
                当前上传文件已接入指标计算。可用指标和图表取决于已映射的字段。
              </span>
              <div className="capability-availability">
                {capabilities
                  .filter((c) => c.available)
                  .map((c) => (
                    <span key={c.key} className="avail-yes">
                      ✓ {c.label}
                    </span>
                  ))}
                {capabilities
                  .filter((c) => !c.available)
                  .map((c) => (
                    <span key={c.key} className="avail-no">
                      ✗ {c.label}（{c.reason}）
                    </span>
                  ))}
              </div>
            </section>
          )}
          <section className="schema-actions">
            {hasGranularityErrors && (
              <div className="schema-blocking-note">
                <strong>暂不能确认</strong>
                <span>{granularityIssues.join("；")}</span>
              </div>
            )}
            <button className="secondary-button" onClick={onBack}>
              返回修改文件
            </button>
            <button
              className="primary-button"
              disabled={
                hasBlockingFiles ||
                hasQualityErrors ||
                hasGranularityErrors ||
                hasDuplicateMappings ||
                hasModelErrors ||
                hasSingleTableErrors ||
                hasUnresolvedDuplicateRoles ||
                hasSeparateDuplicateRoles ||
                hasBlockingCardinality
              }
              onClick={confirmMappings}
            >
              {confirmed ? "已保存映射" : "确认字段映射 →"}
            </button>
            <button
              className="primary-button"
              disabled={!confirmed || !onEnterDashboard}
              onClick={() => onEnterDashboard?.()}
            >
              进入经营看板
            </button>
          </section>
          {relationshipDraft && (
            <div className="relationship-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRelationshipDraft(null); }}>
              <section className="relationship-modal" role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">RELATIONSHIP SETUP</span>
                    <h2 id="relationship-dialog-title">{relationshipDraft.id ? "修改数据关系" : "手动新增关系"}</h2>
                  </div>
                  <button className="text-button" onClick={() => setRelationshipDraft(null)}>关闭</button>
                </div>
                <div className="relationship-form-grid">
                  <label>来源表<select value={relationshipDraft.leftTableId} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, leftTableId: event.target.value, leftField: "" })}><option value="">请选择</option>{session.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label>
                  <label>来源字段<select disabled={!relationshipDraft.leftTableId} value={relationshipDraft.leftField} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, leftField: event.target.value })}><option value="">请选择</option>{tableById(relationshipDraft.leftTableId)?.columns.map((column) => <option value={column.sourceName} key={column.sourceName}>{column.sourceName}</option>)}</select></label>
                  <label>对照表<select value={relationshipDraft.rightTableId} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, rightTableId: event.target.value, rightField: "", displayField: "" })}><option value="">请选择</option>{session.tables.filter((table) => table.id !== relationshipDraft.leftTableId).map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label>
                  <label>连接字段<select disabled={!relationshipDraft.rightTableId} value={relationshipDraft.rightField} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, rightField: event.target.value })}><option value="">请选择</option>{tableById(relationshipDraft.rightTableId)?.columns.map((column) => <option value={column.sourceName} key={column.sourceName}>{column.sourceName}{column.semanticType ? ` · ${canonicalDisplay(column.semanticType)}` : ""}</option>)}</select></label>
                  <label className="relationship-display-select">显示字段<select disabled={!relationshipDraft.rightTableId} value={relationshipDraft.displayField} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, displayField: event.target.value })}><option value="">保留原始 ID</option>{tableById(relationshipDraft.rightTableId)?.columns.filter((column) => column.sourceName !== relationshipDraft.rightField).map((column) => <option value={column.sourceName} key={column.sourceName}>{column.sourceName}{column.semanticType ? ` · ${canonicalDisplay(column.semanticType)}` : ""}</option>)}</select></label>
                </div>
                {draftEvaluation ? (
                  <div className="relationship-live-check">
                    <div><span>匹配率</span><strong>{(draftEvaluation.matchRate * 100).toFixed(1)}%</strong></div>
                    <div><span>右键唯一性</span><strong>{(draftEvaluation.rightKeyUniqueness * 100).toFixed(1)}%</strong></div>
                    <div><span>关系类型</span><strong>{draftEvaluation.cardinality === "many-to-one" ? "多对一" : "一对一"}</strong></div>
                    <div><span>未匹配键</span><strong>{draftEvaluation.evidence.unmatchedLeftCount}</strong></div>
                  </div>
                ) : <p className="relationship-form-hint">选择两张不同的表和连接字段后，会立即验证匹配率和唯一性。</p>}
                {draftEvaluation?.diagnostics.length ? <div className="relationship-diagnostics modal-diagnostics">{draftEvaluation.diagnostics.map((diagnostic, index) => <span className={diagnostic.severity} key={`${diagnostic.code}-${index}`}>{diagnostic.message}</span>)}</div> : null}
                <div className="relationship-modal-actions">
                  <button className="secondary-button" onClick={() => setRelationshipDraft(null)}>取消</button>
                  <button className="primary-button" disabled={!draftEvaluation} onClick={saveRelationshipDraft}>{draftEvaluation?.diagnostics.some((diagnostic) => diagnostic.severity === "blocking") ? "保存为待处理" : "保存并确认"}</button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}

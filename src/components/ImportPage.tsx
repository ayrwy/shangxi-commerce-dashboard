import { useRef, useState } from "react";
import {
  createFileId,
  emptyImportSession,
  mappingsForFile,
  type ImportSession,
  type ImportedFile,
} from "../importSession";
import { readImportedFile } from "../importFileReader";
import CsvPreviewPanel from "./CsvPreviewPanel";
import LoadingNotice from "./LoadingNotice";

type Props = {
  session: ImportSession;
  setSession: React.Dispatch<React.SetStateAction<ImportSession>>;
  onOpen: (value: string) => void;
  onConfigure: () => void;
};

export default function ImportPage({
  session,
  setSession,
  onOpen,
  onConfigure,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_TOTAL_SIZE = 200 * 1024 * 1024;
  const MAX_FILE_COUNT = 8;
  const cancelers = useRef(new Map<string, () => void>());
  const parseFile = (item: ImportedFile) => {
    setSession((prev) => ({
      ...prev,
      files: prev.files.map((file) =>
        file.id === item.id
          ? { ...file, status: "reading", progress: 0, error: undefined }
          : file,
      ),
      confirmed: false,
    }));
    const cancel = readImportedFile(
      item,
      (preview) => {
        cancelers.current.delete(item.id);
        const status = preview.parseErrors.length
          ? ("error" as const)
          : preview.parseWarnings.length
            ? ("warning" as const)
            : ("ready" as const);
        setSession((prev) => {
          return {
            ...prev,
            files: prev.files.map((file) => file.id === item.id ? { ...file, preview, status, progress: 100, error: preview.parseErrors[0] } : file),
            mappings: preview.parseErrors.length
              ? prev.mappings.filter((mapping) => mapping.fileId !== item.id)
              : [...prev.mappings.filter((mapping) => mapping.fileId !== item.id), mappingsForFile({ ...item, preview, status })],
          };
        });
      },
      (error) => {
        cancelers.current.delete(item.id);
        setSession((prev) => ({
          ...prev,
          files: prev.files.map((file) =>
            file.id === item.id
              ? { ...file, status: "error", progress: undefined, error }
              : file,
          ),
        }));
      },
      (progress) =>
        setSession((prev) => ({
          ...prev,
          files: prev.files.map((file) =>
            file.id === item.id ? { ...file, progress } : file,
          ),
        })),
    );
    cancelers.current.set(item.id, cancel);
  };
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const csvFiles = Array.from(list).filter((file) =>
      file.name.toLowerCase().endsWith(".csv"),
    );
    const messages: string[] = [];
    const existingKeys = new Set(
      session.files.map(
        (file) => file.name + "|" + file.size + "|" + file.lastModified,
      ),
    );
    const accepted: ImportedFile[] = [];
    const batchKeys = new Set<string>();
    Array.from(list).forEach((file) => {
      if (!file.name.toLowerCase().endsWith(".csv")) return;
      const key = file.name + "|" + file.size + "|" + file.lastModified;
      if (file.size > MAX_FILE_SIZE) {
        messages.push(file.name + " exceeds 50 MB");
        return;
      }
      if (existingKeys.has(key) || batchKeys.has(key)) {
        messages.push(file.name + " is already in the queue");
        return;
      }
      batchKeys.add(key);
      accepted.push({
        id: createFileId(file),
        file,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        status: "queued",
      });
    });
    if (Array.from(list).length !== csvFiles.length)
      messages.push("Only CSV files are supported");
    if (session.files.length + accepted.length > MAX_FILE_COUNT) {
      messages.push("\u6700\u591a\u4e0a\u4f20 8 \u4e2a CSV \u6587\u4ef6");
      accepted.splice(MAX_FILE_COUNT - session.files.length);
    }
    const totalSize =
      session.files.reduce((sum, file) => sum + file.size, 0) +
      accepted.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      messages.push("Total file size cannot exceed 200 MB");
      accepted.splice(0);
    }
    if (accepted.length)
      setSession((prev) => ({
        ...prev,
        files: [...prev.files, ...accepted],
        confirmed: false,
      }));
    accepted.forEach(parseFile);
    setUploadMessage(messages.length ? messages.join("; ") : null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };
  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node))
      setIsDragging(false);
  };
  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };
  const removeFile = (id: string) => {
    cancelers.current.get(id)?.();
    cancelers.current.delete(id);
    if (previewId === id) setPreviewId(null);
    setSession((prev) => ({
      ...prev,
      files: prev.files.filter((file) => file.id !== id),
      mappings: prev.mappings.filter((mapping) => mapping.fileId !== id),
      confirmed: false,
    }));
  };
  const canContinue =
    session.files.length > 0 &&
    session.files.every(
      (file) => file.status === "ready" || file.status === "warning",
    );
  const statusCounts = session.files.reduce<Record<string, number>>((counts, file) => {
    counts[file.status] = (counts[file.status] ?? 0) + 1;
    return counts;
  }, {});
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">DATA INTAKE · CSV</span>
          <h1>数据导入</h1>
          <p>先把订单、商品和用户文件放进来，再确认字段关系。</p>
        </div>
        <button onClick={() => onOpen("数据导入说明")}>查看说明</button>
      </header>
      <section
        className={`upload-hero${isDragging ? " is-dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-copy">
          <span className="section-kicker">MULTI-FILE IMPORT</span>
          <h2>拖入你的经营数据</h2>
          <p>
            支持拖入或选择多个 CSV
            文件。文件只在浏览器内读取，适合先做一轮数据结构预览。
          </p>
          <label className="upload-button">
            选择 CSV 文件
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(event) => addFiles(event.target.files)}
            />
          </label>
        </div>
      </section>
      {uploadMessage && <div className="upload-message">{uploadMessage}</div>}
      {session.files.some((file) => file.status === "reading") && (
        <LoadingNotice label="正在解析 CSV，请耐心等待…" />
      )}
      <div className="storage-note">
        已恢复上次会话的预览和字段配置。若需要重新解析或重试，请重新选择对应 CSV
        文件。
      </div>
      <section className="panel import-panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">FILE QUEUE</span>
            <h2>
              待确认文件{" "}
              {session.files.length ? `· ${session.files.length}` : ""}
            </h2>
          </div>
          {session.files.length > 0 && (
            <div className="queue-summary" aria-label="文件队列状态">
              <span><b>{session.files.length}</b> 个文件</span>
              {statusCounts.ready && <span className="queue-ok">{statusCounts.ready} 个已就绪</span>}
              {statusCounts.warning && <span className="queue-warning">{statusCounts.warning} 个有警告</span>}
              {statusCounts.error && <span className="queue-error">{statusCounts.error} 个需处理</span>}
            </div>
          )}
          {session.files.length > 0 && (
            <button
              className="text-button"
              onClick={() => {
                cancelers.current.forEach((cancel) => cancel());
                cancelers.current.clear();
                setPreviewId(null);
                setSession(emptyImportSession());
              }}
            >
              清空列表
            </button>
          )}
        </div>
        {session.files.length === 0 ? (
          <div className="import-empty">
            <strong>还没有文件</strong>
            <p>建议先上传订单主表，再补充商品、用户或退款表。</p>
          </div>
        ) : (
          <div className="file-list">
            {session.files.map((file) => (
              <div className="file-row-wrap" key={file.id}>
                <div className="file-row">
                  <span className="file-icon" aria-label="CSV 文件">.csv</span>
                  <div>
                    <strong>{file.name}</strong>
                    <small>
                      {(file.size / 1024).toFixed(1)} KB ·{" "}
                      {file.status === "queued"
                        ? "等待读取"
                        : file.status === "reading"
                          ? `读取中 ${file.progress ?? 0}%`
                          : file.preview
                            ? `${file.preview.totalRows.toLocaleString()} 行 · ${file.preview.headers.length} 列`
                            : file.status === "error" ? "尚未生成预览" : "等待预览"}
                    </small>
                    {file.error && (
                      <small className="file-error">{file.error}</small>
                    )}
                  </div>
                  <em className={file.status} role="status" aria-live="polite">
                    {file.status === "queued"
                      ? "排队中"
                      : file.status === "reading"
                        ? "读取中"
                        : file.status === "error"
                          ? "读取失败"
                          : file.status === "warning"
                            ? "有警告"
                            : "已就绪"}
                  </em>
                  {file.status === "reading" && (
                    <button
                      onClick={() => {
                        cancelers.current.get(file.id)?.();
                        cancelers.current.delete(file.id);
                      }}
                    >
                      取消
                    </button>
                  )}
                  {file.status === "error" && (
                    <button onClick={() => parseFile(file)}>重试解析</button>
                  )}
                  {file.preview && (
                    <button
                      onClick={() =>
                        setPreviewId(previewId === file.id ? null : file.id)
                      }
                    >
                      {previewId === file.id ? "收起预览" : "查看预览"}
                    </button>
                  )}
                  <button onClick={() => removeFile(file.id)}>移除</button>
                </div>
                {previewId === file.id && file.preview && (
                  <CsvPreviewPanel preview={file.preview} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="import-next">
        <div>
          <span className="section-kicker">NEXT</span>
          <h2>准备好后，确认字段角色</h2>
          <p>
            {session.files.some(
              (file) => file.status === "reading" || file.status === "queued",
            )
              ? "请等待所有文件完成读取。"
              : session.files.some((file) => file.status === "error")
                ? "请重试或移除读取失败的文件后继续。"
                : session.files.some((file) => file.status === "warning")
                  ? "文件存在警告，继续后可在预览中查看影响。"
                  : "下一步会根据实际上传文件识别角色，并提示缺失字段。"}
          </p>
        </div>
        <button disabled={!canContinue} onClick={onConfigure}>
          继续配置字段 →
        </button>
      </section>
    </>
  );
}

type Props = { label?: string }

export default function LoadingNotice({ label = "正在处理，请耐心等待…" }: Props) {
  return <div className="loading-notice" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><span>{label}</span></div>
}

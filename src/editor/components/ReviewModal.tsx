import type { ContentChange } from '../../shared/diff.js';

interface Props {
  changes: ContentChange[];
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const KIND_LABEL: Record<ContentChange['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};

/** A short, human-readable preview of a field value for the diff list. */
function preview(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'string') return v.length > 90 ? `${v.slice(0, 90)}…` : v;
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') {
    const o = v as { text?: string; href?: string };
    if (o.text || o.href) return [o.text, o.href].filter(Boolean).join(' → ');
    return 'updated';
  }
  return String(v);
}

export function ReviewModal({ changes, busy, onConfirm, onCancel }: Props) {
  const n = changes.length;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Review changes">
      <div className="modal">
        <h2 className="modal-title">Review changes</h2>
        <p className="modal-lede">
          {n === 0
            ? 'There are no changes to publish.'
            : `${n} change${n === 1 ? '' : 's'} will go live on your site.`}
        </p>

        {n > 0 && (
          <ul className="diff-list">
            {changes.map((c) => (
              <li key={c.key} className={`diff-row ${c.kind}`}>
                <div className="diff-head">
                  <span className={`diff-tag ${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                  <span className="diff-label">{c.label}</span>
                  {c.group && <span className="diff-group">{c.group}</span>}
                </div>
                <div className="diff-body">
                  {c.kind === 'changed' ? (
                    <>
                      <span className="diff-before">{preview(c.before)}</span>
                      <span className="diff-arrow">→</span>
                      <span className="diff-after">{preview(c.after)}</span>
                    </>
                  ) : (
                    <span className={c.kind === 'removed' ? 'diff-before' : 'diff-after'}>
                      {preview(c.kind === 'removed' ? c.before : c.after)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button className="tb-btn ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="tb-btn primary"
            onClick={onConfirm}
            disabled={busy || n === 0}
          >
            {busy ? 'Publishing…' : 'Publish now'}
          </button>
        </div>
      </div>
    </div>
  );
}

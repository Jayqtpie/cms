import type { ContentMeta } from '../../shared/types.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type PublishStatus = 'published' | 'dirty' | 'never';

interface Props {
  saveState: SaveState;
  meta: ContentMeta;
  status: PublishStatus;
  canUndo: boolean;
  hasChanges: boolean;
  siteUrl: string;
  onUndo: () => void;
  onDiscard: () => void;
  onPublish: () => void;
  onSignOut: () => void;
}

function time(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export function Topbar(p: Props) {
  const pill =
    p.status === 'published'
      ? { cls: 'pill pill-ok', text: 'Published & live' }
      : p.status === 'dirty'
        ? { cls: 'pill pill-warn', text: 'Unpublished changes' }
        : { cls: 'pill pill-warn', text: 'Not published yet' };

  return (
    <header className="topbar">
      <div className="brandmark">Content Studio</div>
      <div className="right">
        <span className="hint">
          {p.saveState === 'saving' && 'Saving…'}
          {p.saveState === 'saved' && `Saved · ${time(p.meta.lastSaved)}`}
          {p.saveState === 'error' && 'Save failed'}
        </span>
        <button className="btn" onClick={p.onUndo} disabled={!p.canUndo}>
          Undo
        </button>
        <button className="btn" onClick={p.onDiscard} disabled={!p.hasChanges}>
          Discard
        </button>
        <a className="btn" href={p.siteUrl} target="_blank" rel="noreferrer">
          View Live
        </a>
        <span className={pill.cls}>{pill.text}</span>
        <button className="btn btn-gold" onClick={p.onPublish} disabled={!p.hasChanges}>
          Publish
        </button>
        <button className="btn" onClick={p.onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}

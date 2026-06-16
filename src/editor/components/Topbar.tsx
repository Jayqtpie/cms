import { Icon } from './Icon.js';
import type { ContentMeta } from '../../shared/types.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type PublishStatus = 'published' | 'dirty' | 'never';

interface Props {
  brandName: string;
  email: string | null;
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
      ? { cls: 'pub-pill live', text: 'Published & live' }
      : p.status === 'dirty'
        ? { cls: 'pub-pill changes', text: 'Unpublished changes' }
        : { cls: 'pub-pill new', text: 'Not published yet' };

  const showSaved = (p.saveState === 'saved' || p.saveState === 'idle') && p.meta.lastSaved;

  return (
    <header className="top">
      <div className="top-l">
        <div className="brandmark">
          <span className="bm-main">{p.brandName}</span>
          <span className="bm-tag">Content Studio</span>
        </div>
      </div>
      <div className="top-r">
        <div className="save-state">
          {p.saveState === 'saving' && (
            <span className="ss">
              <span className="spin" /> Saving…
            </span>
          )}
          {p.saveState === 'error' && <span className="ss error">Save failed</span>}
          {p.saveState !== 'saving' && p.saveState !== 'error' && showSaved && (
            <span className="ss saved">
              <Icon name="check" size={14} /> Saved · {time(p.meta.lastSaved)}
            </span>
          )}
          {p.saveState !== 'saving' && p.saveState !== 'error' && !showSaved && (
            <span className="ss">All changes auto-save</span>
          )}
        </div>
        <button className="tb-btn ghost" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl/Cmd+Z)">
          <Icon name="undo" size={15} /> Undo
        </button>
        <button className="tb-btn ghost hide-mid" onClick={p.onDiscard} disabled={!p.hasChanges}>
          Discard
        </button>
        <a className="tb-btn ghost hide-mid" href={p.siteUrl} target="_blank" rel="noreferrer">
          <Icon name="external" size={14} /> View live
        </a>
        <div className="pub-wrap">
          <span className={pill.cls}>
            <span className="pp-dot" />
            {pill.text}
          </span>
          <button className="tb-btn primary" onClick={p.onPublish} disabled={!p.hasChanges}>
            <Icon name="rocket" size={15} /> Publish
          </button>
        </div>
        <button className="avatar" onClick={p.onSignOut} title="Sign out">
          {(p.email || 'A').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  );
}

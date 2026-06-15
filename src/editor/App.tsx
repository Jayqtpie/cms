import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.css';
import type { BrandConfig, Content, ContentMeta, Field } from '../shared/types.js';
import { createApiClient } from './api.js';
import { Login } from './components/Login.js';
import { Topbar, type SaveState, type PublishStatus } from './components/Topbar.js';
import { Sidebar } from './components/Sidebar.js';
import { Editor } from './components/Editor.js';
import { Preview } from './components/Preview.js';

const TOKEN_KEY = 'cms:token';
const UNDO_CAP = 120;

function groupsFromSchema(schema: Field[], ordered?: string[]): string[] {
  const found = Array.from(new Set(schema.map((f) => f.group)));
  if (!ordered) return found;
  return ordered.filter((g) => found.includes(g)).concat(found.filter((g) => !ordered.includes(g)));
}

export function App() {
  const api = useMemo(() => createApiClient('', () => localStorage.getItem(TOKEN_KEY)), []);

  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [schema, setSchema] = useState<Field[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [variants, setVariants] = useState<{ id: string; label: string }[]>([{ id: 'default', label: 'Default' }]);
  const [content, setContent] = useState<Content>({});
  const [publishedSnap, setPublishedSnap] = useState<Content>({});
  const [meta, setMeta] = useState<ContentMeta>({ lastSaved: null, lastPublished: null });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [activeSection, setActiveSection] = useState('');
  const [mode, setMode] = useState('default');
  const [toast, setToast] = useState<string | null>(null);

  const undoStack = useRef<Content[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load brand config once.
  useEffect(() => {
    void api.getConfig().then(setConfig);
  }, [api]);

  // Load draft after auth.
  useEffect(() => {
    if (!token) return;
    void api.getDraft().then((b) => {
      setContent(b.content);
      setMeta(b.meta);
    });
    void api.getPublished().then((b) => setPublishedSnap(b.content));
  }, [api, token]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const onSchema = useCallback(
    (s: Field[], g: string[] | undefined, v: { id: string; label: string }[] | undefined) => {
      setSchema(s);
      const gs = groupsFromSchema(s, g);
      setGroups(gs);
      setActiveSection((cur) => cur || gs[0] || '');
      if (v) setVariants([{ id: 'default', label: 'Default' }, ...v.filter((x) => x.id !== 'default')]);
    },
    [],
  );

  const scheduleSave = useCallback(
    (next: Content) => {
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api
          .saveDraft(next)
          .then((b) => {
            setMeta(b.meta);
            setSaveState('saved');
          })
          .catch(() => setSaveState('error'));
      }, 350);
    },
    [api],
  );

  const applyChange = useCallback(
    (key: string, value: unknown) => {
      setContent((prev) => {
        undoStack.current = [...undoStack.current, prev].slice(-UNDO_CAP);
        const next = { ...prev, [key]: value };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setContent(prev);
    scheduleSave(prev);
  }, [scheduleSave]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // Clear any pending debounced save on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const hasChanges = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(publishedSnap),
    [content, publishedSnap],
  );

  const dirtyGroups = useMemo(() => {
    const set = new Set<string>();
    for (const f of schema) {
      if (f.variant) continue;
      if (JSON.stringify(content[f.key]) !== JSON.stringify(publishedSnap[f.key])) set.add(f.group);
    }
    return set;
  }, [schema, content, publishedSnap]);

  const status: PublishStatus = !meta.lastPublished ? 'never' : hasChanges ? 'dirty' : 'published';

  async function login(email: string, password: string) {
    const t = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }

  async function publish() {
    try {
      await api.publish();
      const b = await api.getDraft();
      setPublishedSnap(content);
      setMeta(b.meta);
      flash('Published — your changes are now live');
    } catch {
      flash('Publish failed — please try again');
    }
  }

  async function discard() {
    try {
      const b = await api.discard();
      setContent(b.content);
      setMeta(b.meta);
      flash('Draft changes discarded');
    } catch {
      flash('Discard failed — please try again');
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!config) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!token) return <Login config={config} onLogin={login} />;

  return (
    <div className="app">
      <Topbar
        saveState={saveState}
        meta={meta}
        status={status}
        canUndo={undoStack.current.length > 0}
        hasChanges={hasChanges}
        siteUrl={config.siteUrl}
        onUndo={undo}
        onDiscard={() => void discard()}
        onPublish={() => void publish()}
        onSignOut={signOut}
      />
      <div className="workspace">
        <Sidebar
          groups={groups}
          active={activeSection}
          dirtyGroups={dirtyGroups}
          onSelect={setActiveSection}
        />
        <Editor
          group={activeSection}
          fields={schema}
          content={content}
          variants={variants}
          onChange={applyChange}
          onReset={applyChange}
          upload={(file) => api.upload(file)}
        />
        <Preview siteUrl={config.siteUrl} content={content} variant={mode} onSchema={onSchema} />
      </div>
      {variants.length > 1 && (
        <div style={{ position: 'fixed', bottom: 22, left: 22, display: 'flex', gap: 6 }}>
          {variants.map((v) => (
            <button
              key={v.id}
              className={v.id === mode ? 'btn btn-gold' : 'btn'}
              onClick={() => setMode(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

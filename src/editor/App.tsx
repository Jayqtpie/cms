import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.css';
import type { BrandConfig, Content, ContentMeta, Field } from '../shared/types.js';
import { createApiClient } from './api.js';
import { Login } from './components/Login.js';
import { Topbar, type SaveState, type PublishStatus } from './components/Topbar.js';
import { Sidebar } from './components/Sidebar.js';
import { Editor } from './components/Editor.js';
import { Preview } from './components/Preview.js';
import { Icon } from './components/Icon.js';
import { accentVars } from './theme.js';

const TOKEN_KEY = 'cms:token';
const EMAIL_KEY = 'cms:email';
const UNDO_CAP = 120;

type Toast = { text: string; kind: 'ok' | 'warn' } | null;

function groupsFromSchema(schema: Field[], ordered?: string[]): string[] {
  const found = Array.from(new Set(schema.map((f) => f.group)));
  if (!ordered) return found;
  return ordered.filter((g) => found.includes(g)).concat(found.filter((g) => !ordered.includes(g)));
}

export function App() {
  const api = useMemo(() => createApiClient('', () => localStorage.getItem(TOKEN_KEY)), []);

  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));
  const [schema, setSchema] = useState<Field[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [groupIcons, setGroupIcons] = useState<Record<string, string> | undefined>(undefined);
  const [variants, setVariants] = useState<{ id: string; label: string }[]>([
    { id: 'default', label: 'Default' },
  ]);
  const [content, setContent] = useState<Content>({});
  const [publishedSnap, setPublishedSnap] = useState<Content>({});
  const [meta, setMeta] = useState<ContentMeta>({ lastSaved: null, lastPublished: null });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [activeSection, setActiveSection] = useState('');
  const [mode, setMode] = useState('default');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [resetFlash, setResetFlash] = useState<{ key: string; n: number } | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const undoStack = useRef<Content[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api.getConfig().then(setConfig);
  }, [api]);

  useEffect(() => {
    if (!token) return;
    void api.getDraft().then((b) => {
      setContent(b.content);
      setMeta(b.meta);
    });
    void api.getPublished().then((b) => setPublishedSnap(b.content));
  }, [api, token]);

  const flash = useCallback((text: string, kind: 'ok' | 'warn' = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const onSchema = useCallback(
    (
      s: Field[],
      g: string[] | undefined,
      v: { id: string; label: string }[] | undefined,
      icons: Record<string, string> | undefined,
    ) => {
      setSchema(s);
      const gs = groupsFromSchema(s, g);
      setGroups(gs);
      setActiveSection((cur) => cur || gs[0] || '');
      setGroupIcons(icons);
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

  const resetField = useCallback(
    (key: string, value: unknown) => {
      applyChange(key, value);
      setResetFlash((f) => ({ key, n: (f?.n ?? 0) + 1 }));
    },
    [applyChange],
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

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

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

  async function login(emailValue: string, password: string) {
    const t = await api.login(emailValue, password);
    localStorage.setItem(TOKEN_KEY, t);
    if (emailValue) localStorage.setItem(EMAIL_KEY, emailValue);
    setEmail(emailValue || null);
    setToken(t);
  }

  async function publish() {
    try {
      await api.publish();
      const b = await api.getDraft();
      setPublishedSnap(content);
      setMeta(b.meta);
      flash('Published — your changes are now live on the site.', 'ok');
    } catch {
      flash('Publish failed — please try again.', 'warn');
    }
  }

  async function discard() {
    try {
      const b = await api.discard();
      setContent(b.content);
      setMeta(b.meta);
      flash('Draft changes discarded — back to the published version.', 'warn');
    } catch {
      flash('Discard failed — please try again.', 'warn');
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setEmail(null);
    setToken(null);
  }

  const themeVars = config ? accentVars(config.brand.accent) : undefined;

  if (!config) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!token) return <Login config={config} onLogin={login} style={themeVars} />;

  return (
    <div className="app" style={themeVars}>
      <Topbar
        brandName={config.brand.name}
        email={email}
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
      <div className="body">
        <Sidebar
          groups={groups}
          active={activeSection}
          dirtyGroups={dirtyGroups}
          groupIcons={groupIcons}
          onSelect={setActiveSection}
        />
        <main className="ed-scroll">
          <Editor
            group={activeSection}
            fields={schema}
            content={content}
            variants={variants}
            onChange={applyChange}
            onReset={resetField}
            upload={(file) => api.upload(file)}
          />
        </main>
        <aside className="pv-col">
          <Preview
            siteUrl={config.siteUrl}
            content={content}
            variant={mode}
            variants={variants}
            device={device}
            scrollGroup={activeSection}
            reloadKey={reloadKey}
            flash={resetFlash}
            onSchema={onSchema}
            onVariant={setMode}
            onDevice={setDevice}
            onReload={() => setReloadKey((k) => k + 1)}
          />
        </aside>
      </div>
      {toast && (
        <div className={'toast ' + toast.kind}>
          <Icon name={toast.kind === 'ok' ? 'check' : 'bolt'} size={16} />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

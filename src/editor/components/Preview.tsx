import { useEffect, useRef } from 'react';
import { Icon } from './Icon.js';
import type { Content, Field } from '../../shared/types.js';

interface Props {
  siteUrl: string;
  content: Content;
  variant: string;
  variants: { id: string; label: string }[];
  device: 'desktop' | 'mobile';
  scrollGroup: string;
  reloadKey: number;
  flash: { key: string; n: number } | null;
  onSchema: (
    schema: Field[],
    groups: string[] | undefined,
    variants: { id: string; label: string }[] | undefined,
    groupIcons: Record<string, string> | undefined,
  ) => void;
  onVariant: (id: string) => void;
  onDevice: (d: 'desktop' | 'mobile') => void;
  onReload: () => void;
}

export function Preview({
  siteUrl,
  content,
  variant,
  variants,
  device,
  scrollGroup,
  reloadKey,
  flash,
  onSchema,
  onVariant,
  onDevice,
  onReload,
}: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  // Mirror latest content/variant into refs so the once-registered listener reads
  // current values on `cms-ready` rather than a stale closure.
  const contentRef = useRef(content);
  const variantRef = useRef(variant);
  contentRef.current = content;
  variantRef.current = variant;

  // Push content into the iframe whenever it changes (after ready).
  useEffect(() => {
    if (!readyRef.current) return;
    ref.current?.contentWindow?.postMessage({ type: 'cms-content', content, variant }, '*');
  }, [content, variant]);

  // Scroll the preview to the active section.
  useEffect(() => {
    if (!readyRef.current || !scrollGroup) return;
    ref.current?.contentWindow?.postMessage({ type: 'cms-scroll', group: scrollGroup }, '*');
  }, [scrollGroup]);

  // Flash an element when its field is reset to default.
  useEffect(() => {
    if (!readyRef.current || !flash) return;
    ref.current?.contentWindow?.postMessage({ type: 'cms-flash', key: flash.key }, '*');
  }, [flash]);

  // A manual refresh reloads the iframe (key change) — reset ready until it re-announces.
  useEffect(() => {
    readyRef.current = false;
  }, [reloadKey]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = e.data as {
        type?: string;
        schema?: Field[];
        groups?: string[];
        variants?: { id: string; label: string }[];
        groupIcons?: Record<string, string>;
      };
      if (msg?.type === 'cms-schema' && msg.schema) {
        onSchema(msg.schema, msg.groups, msg.variants, msg.groupIcons);
      }
      if (msg?.type === 'cms-ready') {
        readyRef.current = true;
        ref.current?.contentWindow?.postMessage(
          { type: 'cms-content', content: contentRef.current, variant: variantRef.current },
          '*',
        );
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSchema]);

  const src = siteUrl.includes('?') ? `${siteUrl}&cms=preview` : `${siteUrl}?cms=preview`;

  return (
    <div className="pv">
      <div className="pv-bar">
        <div className="pv-badge">
          <span className="pv-dot" /> Live draft preview
        </div>
        <div className="pv-tools">
          {variants.length > 1 && (
            <div className="seg" role="group" aria-label="Content variant">
              {variants.map((v) => (
                <button
                  key={v.id}
                  className={v.id === variant ? 'on' : ''}
                  onClick={() => onVariant(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <div className="seg" role="group" aria-label="Preview device">
            <button
              className={device === 'desktop' ? 'on' : ''}
              onClick={() => onDevice('desktop')}
              title="Desktop"
            >
              <Icon name="monitor" size={14} />
            </button>
            <button
              className={device === 'mobile' ? 'on' : ''}
              onClick={() => onDevice('mobile')}
              title="Mobile"
            >
              <Icon name="phone" size={14} />
            </button>
          </div>
          <button className="pv-icon" onClick={onReload} title="Refresh preview">
            <Icon name="reset" size={15} />
          </button>
        </div>
      </div>
      <div className={'pv-stage' + (device === 'mobile' ? ' mobile' : '')}>
        <div className="pv-frame">
          <iframe key={reloadKey} ref={ref} src={src} title="Site preview" />
        </div>
      </div>
    </div>
  );
}

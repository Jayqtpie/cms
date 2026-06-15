import { useEffect, useRef } from 'react';
import type { Content, Field } from '../../shared/types.js';

interface Props {
  siteUrl: string;
  content: Content;
  variant: string;
  onSchema: (
    schema: Field[],
    groups: string[] | undefined,
    variants: { id: string; label: string }[] | undefined,
  ) => void;
}

export function Preview({ siteUrl, content, variant, onSchema }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  // Mirror the latest content/variant into refs so the message listener (which is
  // registered once) reads current values on `cms-ready` rather than a stale closure.
  const contentRef = useRef(content);
  const variantRef = useRef(variant);
  contentRef.current = content;
  variantRef.current = variant;

  // Push content into the iframe whenever it changes (after ready).
  useEffect(() => {
    if (!readyRef.current) return;
    ref.current?.contentWindow?.postMessage({ type: 'cms-content', content, variant }, '*');
  }, [content, variant]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = e.data as {
        type?: string;
        schema?: Field[];
        groups?: string[];
        variants?: { id: string; label: string }[];
      };
      if (msg?.type === 'cms-schema' && msg.schema) {
        onSchema(msg.schema, msg.groups, msg.variants);
      }
      if (msg?.type === 'cms-ready') {
        readyRef.current = true;
        // Read latest values via refs — the draft may have loaded after this
        // listener was registered, so the closure's content/variant could be stale.
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
    <div className="preview-pane">
      <iframe ref={ref} src={src} title="Live preview" />
    </div>
  );
}

import { useRef, useState } from 'react';
import { Icon } from '../Icon.js';

interface Props {
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
  alt?: string;
  onAltChange?: (alt: string) => void;
}

export function ImageField({ value, onChange, upload, alt, onAltChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file || !/^image\//.test(file.type)) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await upload(file));
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="img-wrap">
      <div
        className={'img-drop' + (drag ? ' drag' : '') + (value ? ' has' : '')}
        style={value ? { backgroundImage: `url(${value})` } : undefined}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        {!value && (
          <div className="img-empty">
            <Icon name="upload" size={22} />
            <span>{busy ? 'Uploading…' : 'Drag a photo here, or click to choose'}</span>
          </div>
        )}
        {value && <span className="img-replace">{busy ? 'Uploading…' : 'Click or drop to replace'}</span>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <div className="fld-hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {value && onAltChange && (
        <input
          className="img-alt"
          type="text"
          value={alt ?? ''}
          placeholder="Describe this image (for search engines & screen readers)"
          onChange={(e) => onAltChange(e.target.value)}
        />
      )}
      {value && (
        <button type="button" className="img-remove" onClick={() => onChange('')}>
          <Icon name="x" size={13} /> Remove photo
        </button>
      )}
    </div>
  );
}

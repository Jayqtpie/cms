import { useRef, useState } from 'react';
import { Icon } from '../Icon.js';
import { classifyVideo } from '../../../engine/video.js';

interface Props {
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
}

export function VideoField({ value, onChange, upload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');

  async function handleFile(file: File | undefined) {
    if (!file) return;
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

  const kind = value ? classifyVideo(value).kind : null;

  return (
    <div>
      <div className="vid-seg">
        <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>
          Upload
        </button>
        <button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>
          URL
        </button>
      </div>

      {mode === 'upload' ? (
        <div
          className="img-drop"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFile(e.dataTransfer.files[0]);
          }}
        >
          <div className="img-empty">
            <Icon name="upload" size={22} />
            <span>{busy ? 'Uploading…' : 'Drag a video here, or click to choose'}</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <input
          className="fld-input"
          type="text"
          value={value ?? ''}
          placeholder="Paste a video URL — file, YouTube, or Vimeo"
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {value && (
        <div className="vid-preview">
          {kind === 'file' ? (
            <video src={value} controls muted playsInline />
          ) : (
            <span className="fld-hint">
              {kind === 'youtube' ? 'YouTube' : 'Vimeo'} embed: {value}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="fld-hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
}

export function ImageField({ value, onChange, upload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div
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
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 'var(--radius-ctrl)',
        padding: 14,
        textAlign: 'center',
        cursor: 'pointer',
      }}
    >
      {value ? (
        <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6 }} />
      ) : (
        <span className="hint">{busy ? 'Uploading…' : 'Drop an image or click to upload'}</span>
      )}
      {error && (
        <div className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function RichField({ value, onChange }: Props) {
  return (
    <>
      <textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      <div className="hint">Use *stars* for emphasis and new lines for breaks.</div>
    </>
  );
}

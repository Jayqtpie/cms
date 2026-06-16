interface Props {
  value: { text: string; href: string };
  onChange: (v: { text: string; href: string }) => void;
}

export function LinkField({ value, onChange }: Props) {
  const v = value ?? { text: '', href: '' };
  return (
    <div className="fld-row">
      <input
        className="fld-input"
        type="text"
        placeholder="Label"
        value={v.text ?? ''}
        onChange={(e) => onChange({ ...v, text: e.target.value })}
      />
      <input
        className="fld-input"
        type="text"
        placeholder="https://…"
        value={v.href ?? ''}
        onChange={(e) => onChange({ ...v, href: e.target.value })}
      />
    </div>
  );
}

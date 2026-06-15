interface LinkValue {
  text: string;
  href: string;
}
interface Props {
  value: LinkValue;
  onChange: (v: LinkValue) => void;
}

export function LinkField({ value, onChange }: Props) {
  const v = value ?? { text: '', href: '' };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input
        type="text"
        placeholder="Link text"
        value={v.text}
        onChange={(e) => onChange({ ...v, text: e.target.value })}
      />
      <input
        type="text"
        placeholder="https://…"
        value={v.href}
        onChange={(e) => onChange({ ...v, href: e.target.value })}
      />
    </div>
  );
}

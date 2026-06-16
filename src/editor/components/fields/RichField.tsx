interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function RichField({ value, onChange }: Props) {
  return (
    <textarea
      className="fld-input fld-area"
      rows={3}
      value={value ?? ''}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

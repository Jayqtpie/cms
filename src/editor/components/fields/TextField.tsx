interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function TextField({ value, onChange }: Props) {
  return (
    <input
      type="text"
      className="fld-input"
      value={value ?? ''}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

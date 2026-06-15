interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function TextField({ value, onChange }: Props) {
  return <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

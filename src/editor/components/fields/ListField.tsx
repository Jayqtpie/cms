import { useState } from 'react';
import type { ItemField } from '../../../shared/types.js';
import { TextField } from './TextField.js';
import { RichField } from './RichField.js';

type Item = Record<string, unknown>;

interface Props {
  items: Item[];
  itemFields: ItemField[];
  onChange: (items: Item[]) => void;
}

export function ListField({ items, itemFields, onChange }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const list = items ?? [];

  const update = (i: number, key: string, val: unknown) => {
    const next = list.map((it, idx) => (idx === i ? { ...it, [key]: val } : it));
    onChange(next);
  };
  const add = () => onChange([...list, Object.fromEntries(itemFields.map((f) => [f.key, '']))]);
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const reorder = (from: number, to: number) => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {list.map((item, i) => (
        <div
          key={i}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={() => setDragIndex(null)}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
            setDragIndex(null);
          }}
          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="hint">Item {i + 1}</span>
            <button type="button" className="reset-pill" onClick={() => remove(i)}>
              Delete
            </button>
          </div>
          {itemFields.map((f) => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label>{f.label}</label>
              {f.type === 'rich' ? (
                <RichField
                  value={String(item[f.key] ?? '')}
                  onChange={(v) => update(i, f.key, v)}
                />
              ) : (
                <TextField
                  value={String(item[f.key] ?? '')}
                  onChange={(v) => update(i, f.key, v)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="btn" onClick={add}>
        + Add item
      </button>
    </div>
  );
}

import type { Field, Content } from '../../shared/types.js';
import { TextField } from './fields/TextField.js';
import { RichField } from './fields/RichField.js';
import { LinkField } from './fields/LinkField.js';
import { ImageField } from './fields/ImageField.js';
import { ListField } from './fields/ListField.js';

interface Props {
  group: string;
  fields: Field[];
  content: Content;
  variants: { id: string; label: string }[];
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string, value: unknown) => void;
  upload: (file: File) => Promise<string>;
}

function renderField(
  field: Field,
  _key: string,
  value: unknown,
  onChange: (v: unknown) => void,
  upload: (file: File) => Promise<string>,
) {
  switch (field.type) {
    case 'rich':
      return <RichField value={String(value ?? '')} onChange={onChange} />;
    case 'image':
      return <ImageField value={String(value ?? '')} onChange={onChange} upload={upload} />;
    case 'link':
      return (
        <LinkField
          value={(value as { text: string; href: string }) ?? { text: '', href: '' }}
          onChange={onChange}
        />
      );
    default:
      return <TextField value={String(value ?? '')} onChange={onChange} />;
  }
}

export function Editor({ group, fields, content, variants, onChange, onReset, upload }: Props) {
  // Only base (non-@variant) fields are top-level cards within the active group.
  const groupFields = fields.filter((f) => f.group === group && !f.variant);

  return (
    <section className="editor-pane">
      <div className="editor-col">
        <h2>{group}</h2>
        <p className="blurb">Edit the {group} section. Changes preview live and auto-save.</p>
        {groupFields.map((f) => {
          const value = content[f.key] ?? f.defaultContent;
          const changed = JSON.stringify(value) !== JSON.stringify(f.defaultContent);
          return (
            <div className="field-card" key={f.key}>
              <div className="label-row">
                <label>{f.label}</label>
                {changed && (
                  <button
                    type="button"
                    className="reset-pill"
                    onClick={() => onReset(f.key, f.defaultContent)}
                  >
                    Reset
                  </button>
                )}
              </div>
              {f.isList ? (
                <ListField
                  items={(content[f.key] as Record<string, unknown>[]) ?? []}
                  itemFields={f.itemFields ?? []}
                  onChange={(items) => onChange(f.key, items)}
                />
              ) : (
                renderField(f, f.key, value, (v) => onChange(f.key, v), upload)
              )}

              {!f.isList &&
                variants
                  .filter((v) => v.id !== 'default')
                  .map((v) => {
                    const vk = `${f.key}@${v.id}`;
                    return (
                      <div className="variant-sub" key={vk}>
                        <span className="variant-tag">{v.label}</span>
                        {renderField(
                          f,
                          vk,
                          content[vk] ?? '',
                          (val) => onChange(vk, val),
                          upload,
                        )}
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

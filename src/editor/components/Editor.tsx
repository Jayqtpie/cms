import type { Field, Content, FieldType } from '../../shared/types.js';
import { Icon } from './Icon.js';
import { TextField } from './fields/TextField.js';
import { RichField } from './fields/RichField.js';
import { LinkField } from './fields/LinkField.js';
import { ImageField } from './fields/ImageField.js';
import { ListField } from './fields/ListField.js';
import { VideoField } from './fields/VideoField.js';

interface Props {
  group: string;
  fields: Field[];
  content: Content;
  variants: { id: string; label: string }[];
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string, value: unknown) => void;
  upload: (file: File) => Promise<string>;
}

const BLURBS: { match: string[]; text: string }[] = [
  { match: ['hero', 'banner'], text: 'The first thing visitors see — top of the page.' },
  { match: ['promise', 'value', 'why'], text: 'The case for choosing you, in a few lines.' },
  { match: ['journey', 'process', 'step', 'how'], text: 'How it works, step by step.' },
  { match: ['countdown', 'timer', 'event'], text: 'A time-bound prompt to act now.' },
  { match: ['include', 'feature', 'what'], text: 'Everything that comes with it.' },
  { match: ['package', 'pricing', 'plan', 'price'], text: 'Your offers and what each one costs.' },
  { match: ['result', 'gallery', 'transform', 'proof'], text: 'Proof of the work — photos and outcomes.' },
  { match: ['testimonial', 'review', 'client'], text: 'What past clients say about you.' },
  { match: ['faq', 'question'], text: 'Answers to the questions people ask most.' },
  { match: ['contact', 'enquir', 'book'], text: 'How visitors get in touch or book.' },
  { match: ['footer', 'legal'], text: 'Small print, links and sign-off.' },
];

function blurbFor(group: string): string {
  const n = group.toLowerCase();
  for (const b of BLURBS) if (b.match.some((m) => n.includes(m))) return b.text;
  return `Edit the ${group} section. Changes preview live and save automatically.`;
}

function hintFor(f: Field): string | undefined {
  if (f.hint) return f.hint;
  if (f.type === 'rich') return 'New line = line break · wrap a word in *stars* for italic emphasis.';
  return undefined;
}

function renderField(
  type: FieldType,
  value: unknown,
  onChange: (v: unknown) => void,
  upload: (file: File) => Promise<string>,
) {
  switch (type) {
    case 'rich':
      return <RichField value={String(value ?? '')} onChange={onChange} />;
    case 'image':
      return <ImageField value={String(value ?? '')} onChange={onChange} upload={upload} />;
    case 'video':
      return <VideoField value={String(value ?? '')} onChange={onChange} upload={upload} />;
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
  const groupFields = fields.filter((f) => f.group === group && !f.variant);
  const extraVariants = variants.filter((v) => v.id !== 'default');

  return (
    <div className="ed">
      <header className="ed-head">
        <h2>{group}</h2>
        <p>{blurbFor(group)}</p>
      </header>

      {groupFields.length === 0 ? (
        <div className="ed-empty">No editable fields in this section yet.</div>
      ) : (
        <div className="ed-fields">
          {groupFields.map((f) => {
            const value = content[f.key] ?? f.defaultContent;
            const changed = JSON.stringify(value) !== JSON.stringify(f.defaultContent);
            const hint = hintFor(f);
            return (
              <div className="fld" key={f.key}>
                <div className="fld-head">
                  <span className="fld-label">{f.label}</span>
                  {changed && !f.isList && (
                    <button
                      type="button"
                      className="fld-reset"
                      onClick={() => onReset(f.key, f.defaultContent)}
                    >
                      <Icon name="reset" size={13} /> Reset
                    </button>
                  )}
                  {hint && <span className="fld-hint">{hint}</span>}
                </div>

                {f.isList ? (
                  <ListField
                    items={(content[f.key] as Record<string, unknown>[]) ?? []}
                    itemFields={f.itemFields ?? []}
                    onChange={(items) => onChange(f.key, items)}
                  />
                ) : (
                  renderField(f.type, value, (v) => onChange(f.key, v), upload)
                )}

                {!f.isList &&
                  extraVariants.map((v) => {
                    const vk = `${f.key}@${v.id}`;
                    const variantField = fields.find((x) => x.key === vk);
                    if (!variantField) return null;
                    const vVal = content[vk] ?? variantField.defaultContent ?? '';
                    return (
                      <div className="fld-variant" key={vk}>
                        <div className="fld-variant-tag">
                          <Icon name="ring" size={13} /> {v.label}-mode version
                        </div>
                        {renderField(f.type, vVal, (val) => onChange(vk, val), upload)}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

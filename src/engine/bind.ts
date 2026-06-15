import type { Content, FieldType } from '../shared/types.js';

export function renderRich(value: string): string {
  return value.replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

export function paintElement(el: HTMLElement, type: FieldType, value: unknown): void {
  switch (type) {
    case 'image':
      if (el instanceof HTMLImageElement) el.src = String(value);
      else el.style.backgroundImage = `url("${String(value)}")`;
      break;
    case 'rich':
      el.innerHTML = renderRich(String(value));
      break;
    case 'link': {
      const v = (value ?? {}) as { text?: string; href?: string };
      el.textContent = v.text ?? '';
      if (v.href != null) el.setAttribute('href', v.href);
      break;
    }
    case 'boolean':
      el.style.display = value ? '' : 'none';
      break;
    // 'select' editor widget is deferred (see plan self-review); paint it as
    // plain text for now so the type is handled explicitly, not silently.
    case 'select':
    default:
      el.textContent = String(value);
  }
}

function baseKey(raw: string): string {
  const at = raw.indexOf('@');
  return at === -1 ? raw : raw.slice(0, at);
}

export function bindLists(content: Content, root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-cms-list]').forEach((listEl) => {
    const key = listEl.getAttribute('data-cms-list')!;
    const items = content[key];
    const tpl = listEl.querySelector<HTMLTemplateElement>('template[data-cms-item]');
    if (!Array.isArray(items) || !tpl || !tpl.content.firstElementChild) return;

    listEl.querySelectorAll('[data-cms-rendered]').forEach((n) => n.remove());

    for (const item of items) {
      const clone = tpl.content.firstElementChild.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-cms-rendered', '');
      clone.querySelectorAll<HTMLElement>('[data-cms-field]').forEach((fieldEl) => {
        const fk = fieldEl.getAttribute('data-cms-field')!;
        const type = (fieldEl.getAttribute('data-cms-type') as FieldType) || 'text';
        paintElement(fieldEl, type, (item as Record<string, unknown>)[fk]);
      });
      listEl.appendChild(clone);
    }
  });
}

export function bind(content: Content, root: ParentNode = document, variant = 'default'): void {
  root.querySelectorAll<HTMLElement>('[data-cms]').forEach((el) => {
    const key = baseKey(el.getAttribute('data-cms')!);
    const variantKey = `${key}@${variant}`;
    const value =
      variant !== 'default' && content[variantKey] !== undefined ? content[variantKey] : content[key];
    if (value === undefined) return;
    const type = (el.getAttribute('data-cms-type') as FieldType) || 'text';
    paintElement(el, type, value);
  });

  bindLists(content, root);
}

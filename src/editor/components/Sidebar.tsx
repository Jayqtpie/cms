import { Icon } from './Icon.js';

// Sidebar: section navigation with per-section line icons.
interface Props {
  groups: string[];
  active: string;
  dirtyGroups: Set<string>;
  onSelect: (group: string) => void;
  /** Optional per-section icon overrides keyed by group name (from cms.config.js). */
  groupIcons?: Record<string, string>;
}

// Resolve a line-icon for a section by name. Keeps the CMS generic: any client's
// sections get a sensible icon with zero config, matched by common keywords. An
// explicit groupIcons map (or a future data-cms-group-icon attr) overrides this.
const RULES: { icon: string; keywords: string[] }[] = [
  { icon: 'star', keywords: ['hero', 'banner', 'intro', 'landing', 'masthead'] },
  { icon: 'quote', keywords: ['promise', 'value', 'mission', 'why', 'benefit', 'difference'] },
  { icon: 'path', keywords: ['journey', 'process', 'step', 'how', 'approach', 'timeline', 'method'] },
  { icon: 'clock', keywords: ['countdown', 'timer', 'event', 'date', 'schedule'] },
  { icon: 'grid', keywords: ['include', 'feature', 'offer', 'what', 'deliver'] },
  { icon: 'layers', keywords: ['package', 'pricing', 'plan', 'tier', 'price', 'rate'] },
  { icon: 'image', keywords: ['result', 'gallery', 'portfolio', 'work', 'transform', 'before', 'after', 'proof'] },
  { icon: 'chat', keywords: ['testimonial', 'review', 'client', 'love'] },
  { icon: 'help', keywords: ['faq', 'question', 'answer'] },
  { icon: 'mail', keywords: ['contact', 'enquir', 'inquir', 'book', 'touch', 'reach', 'email'] },
  { icon: 'eye', keywords: ['about', 'story', 'team', 'bio', 'founder'] },
  { icon: 'ring', keywords: ['gift', 'member', 'ring', 'wedding'] },
  { icon: 'minus', keywords: ['footer', 'bottom', 'legal', 'social'] },
];

export function iconForGroup(name: string, overrides?: Record<string, string>): string {
  if (overrides && overrides[name]) return overrides[name];
  const n = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.icon;
  }
  return 'doc';
}

export function Sidebar({ groups, active, dirtyGroups, onSelect, groupIcons }: Props) {
  return (
    <nav className="sb">
      <div className="sb-cap">Page sections</div>
      <ul className="sb-list">
        {groups.map((g) => (
          <li key={g}>
            <button className={'sb-item' + (g === active ? ' on' : '')} onClick={() => onSelect(g)}>
              <span className="sb-ic">
                <Icon name={iconForGroup(g, groupIcons)} size={17} />
              </span>
              <span className="sb-lbl">{g}</span>
              {dirtyGroups.has(g) && <span className="sb-dot" aria-label="unsaved changes" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="sb-note">
        <Icon name="help" size={14} />
        <span>
          Changes save automatically as a draft. Hit <strong>Publish</strong> to go live.
        </span>
      </div>
    </nav>
  );
}

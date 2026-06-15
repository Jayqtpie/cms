interface Props {
  groups: string[];
  active: string;
  dirtyGroups: Set<string>;
  onSelect: (group: string) => void;
}

export function Sidebar({ groups, active, dirtyGroups, onSelect }: Props) {
  return (
    <nav className="sidebar">
      {groups.map((g) => (
        <button
          key={g}
          className={g === active ? 'active' : ''}
          onClick={() => onSelect(g)}
        >
          <span>{g}</span>
          {dirtyGroups.has(g) && <span className="dot" aria-label="unsaved changes" />}
        </button>
      ))}
    </nav>
  );
}

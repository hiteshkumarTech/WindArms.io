/**
 * WindArms Forge — checklist display panel. Placeholder component: not
 * imported by any route, not connected to real data. Item shape mirrors
 * src/lib/forge/assetChecklist.ts's ChecklistItem loosely (not imported
 * directly, to keep this component usable before that module has a real
 * implementation). See docs/forge/README.md — Forge components are
 * scaffolding only.
 */

export interface ChecklistPanelItem {
  label: string;
  /** null = not yet checked. */
  passed: boolean | null;
}

export interface ChecklistPanelProps {
  title?: string;
  items: ChecklistPanelItem[];
}

function StatusLabel({ passed }: { passed: boolean | null }) {
  if (passed === true) return <span className="text-emerald-400">Pass</span>;
  if (passed === false) return <span className="text-red-400">Fail</span>;
  return <span className="text-white/30">Pending</span>;
}

export default function ChecklistPanel({ title, items }: ChecklistPanelProps) {
  return (
    <div className="glass rounded-2xl p-5">
      {title ? <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3> : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-white/70">{item.label}</span>
            <StatusLabel passed={item.passed} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * WindArms Forge — reusable asset summary card. Placeholder component: not
 * imported by any route, not connected to real data. See
 * docs/forge/README.md — Forge components are scaffolding only.
 */

export type AssetCardStatus = 'draft' | 'in-review' | 'changes-requested' | 'approved' | 'rejected';

export interface AssetCardProps {
  name: string;
  category: string;
  status?: AssetCardStatus;
  thumbnailUrl?: string;
}

const STATUS_LABEL: Record<AssetCardStatus, string> = {
  draft: 'Draft',
  'in-review': 'In Review',
  'changes-requested': 'Changes Requested',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default function AssetCard({ name, category, status = 'draft', thumbnailUrl }: AssetCardProps) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex h-32 w-full items-center justify-center bg-white/5">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] uppercase tracking-widest text-white/30">No preview</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-white">{name}</h3>
        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/40">{category}</p>
        <span className="mt-2 inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/55">
          {STATUS_LABEL[status]}
        </span>
      </div>
    </div>
  );
}

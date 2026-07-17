/**
 * WindArms Forge — asset review workflow. STUB ONLY, per docs/forge/README.md:
 * no production logic, interfaces and TODOs only. Isolated from the real
 * asset pipeline (src/lib/v2/pipeline/) — this module tracks the human
 * review process an asset goes through *before* it becomes a pipeline
 * manifest entry, not a replacement for pipeline-side validation.
 */

export type ReviewStatus = 'draft' | 'in-review' | 'changes-requested' | 'approved' | 'rejected';

export interface ReviewNote {
  author: string;
  message: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  resolved: boolean;
}

export interface AssetReview {
  /** Should eventually match a WindArms Assets/<Category>/<Name> path — see assetMetadata.ts. */
  assetSlug: string;
  status: ReviewStatus;
  notes: ReviewNote[];
  reviewedBy?: string;
  /** ISO 8601 timestamp. */
  reviewedAt?: string;
}

// TODO: implement — create a new AssetReview in 'draft' status for an asset.
export function createReview(assetSlug: string): AssetReview {
  throw new Error('assetReview.createReview: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — transition status to 'in-review', notify reviewers (mechanism TBD).
export function submitForReview(review: AssetReview): AssetReview {
  throw new Error('assetReview.submitForReview: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — transition status to 'approved', record reviewer + timestamp.
export function approveAsset(review: AssetReview, reviewer: string): AssetReview {
  throw new Error('assetReview.approveAsset: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — transition status to 'changes-requested', append a ReviewNote.
export function requestChanges(review: AssetReview, reviewer: string, message: string): AssetReview {
  throw new Error('assetReview.requestChanges: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — mark a specific ReviewNote resolved once addressed.
export function resolveNote(review: AssetReview, noteIndex: number): AssetReview {
  throw new Error('assetReview.resolveNote: not implemented — WindArms Forge is scaffolding only.');
}

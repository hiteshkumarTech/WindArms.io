/**
 * WindArms Forge — asset metadata. STUB ONLY, per docs/forge/README.md: no
 * production logic, interfaces and TODOs only. `category` intentionally
 * mirrors src/lib/v2/pipeline/types.ts's AssetCategory plus the extra
 * production-only categories Forge tracks (icon/logo/sound/music/animation)
 * that the runtime pipeline doesn't need its own type for.
 */

export type ForgeAssetCategory =
  | 'weapon'
  | 'operator'
  | 'map'
  | 'vehicle'
  | 'prop'
  | 'ui'
  | 'icon'
  | 'logo'
  | 'sound'
  | 'music'
  | 'animation';

export type AssetSourceTool = 'blender' | 'meshy' | 'tripo' | 'sketchfab' | 'hired-artist' | 'other';

export interface AssetMetadata {
  /** Should match a pipeline manifest slot once this asset ships — see src/lib/v2/pipeline/manifest.ts. */
  slot: string;
  category: ForgeAssetCategory;
  author: string;
  sourceTool: AssetSourceTool;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
  version: number;
  tags: string[];
  notes?: string;
}

// TODO: implement — read a metadata.json sidecar from an asset's WindArms Assets/ folder.
export function readAssetMetadata(assetFolderPath: string): AssetMetadata {
  throw new Error('assetMetadata.readAssetMetadata: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — write/update a metadata.json sidecar for an asset.
export function writeAssetMetadata(assetFolderPath: string, metadata: AssetMetadata): void {
  throw new Error('assetMetadata.writeAssetMetadata: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — scan WindArms Assets/ and return metadata for every asset found.
export function listAllAssets(): AssetMetadata[] {
  throw new Error('assetMetadata.listAllAssets: not implemented — WindArms Forge is scaffolding only.');
}

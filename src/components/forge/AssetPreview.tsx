/**
 * WindArms Forge — asset preview panel. Placeholder component: not imported
 * by any route, not connected to real data, and does not load or render a
 * real GLB (that's future work — see the "TODO" note below). See
 * docs/forge/README.md — Forge components are scaffolding only.
 */

export interface AssetPreviewProps {
  name: string;
  /** Present once a real .glb is wired up in a future pass — unused today. */
  glbUrl?: string;
}

export default function AssetPreview({ name, glbUrl }: AssetPreviewProps) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-white/5 text-center text-sm text-white/30">
        {glbUrl ? (
          // TODO: mount a real Three.js/React Three Fiber viewer here, reusing
          // src/lib/v2/pipeline/useAssetPipeline.ts's load path — not built yet.
          <span>Preview not implemented — would render {glbUrl}</span>
        ) : (
          <span>No model loaded</span>
        )}
      </div>
      <p className="mt-3 text-sm text-white/55">{name}</p>
    </div>
  );
}

/** Minimal center crosshair: dot plus a soft ring. */
export default function Crosshair() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden>
      <div className="relative h-6 w-6">
        <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
        <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      </div>
    </div>
  );
}

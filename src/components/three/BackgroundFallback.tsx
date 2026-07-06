/**
 * Static ambient backdrop shown while the WebGL scene loads,
 * and as a permanent fallback when WebGL is unavailable.
 */
export default function BackgroundFallback() {
  return (
    <div className="absolute inset-0 bg-void" aria-hidden>
      <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[140px]" />
      <div className="absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full bg-neon-purple/10 blur-[160px]" />
      <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-neon-orange/10 blur-[120px]" />
    </div>
  );
}

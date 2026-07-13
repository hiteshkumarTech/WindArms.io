'use client';

import { POIS, SKYFRONT_HEADING } from '@/lib/v2/content/skyfront';
import SectionHeading from '../shared/SectionHeading';
import SectionShell from '../shared/SectionShell';
import type { SectionRenderProps } from '../types';

const HUB = POIS[0];

/**
 * Map overview: hub-and-spoke floating-island diagram (inline SVG,
 * data-driven from content) beside the POI briefing cards.
 */
export default function SkyfrontSection(_props: SectionRenderProps) {
  return (
    <SectionShell id="skyfront">
      <SectionHeading {...SKYFRONT_HEADING} />

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div
          data-reveal
          className="rounded-3xl border border-white/10 bg-storm-deep/70 p-4 backdrop-blur-xl sm:p-6"
        >
          <svg viewBox="0 0 100 100" role="img" aria-label="Skyfront map diagram" className="w-full">
            {/* Sky bridges (hub → each spoke) */}
            {POIS.slice(1).map((poi) => (
              <line
                key={`bridge-${poi.id}`}
                x1={HUB.diagram.x}
                y1={HUB.diagram.y}
                x2={poi.diagram.x}
                y2={poi.diagram.y}
                stroke="rgba(237,234,227,0.22)"
                strokeWidth="0.7"
                strokeDasharray="2 2"
              />
            ))}

            {POIS.map((poi, index) => (
              <g key={poi.id} className="v2-float" style={{ animationDelay: `${index * 0.9}s` }}>
                {/* Island underside */}
                <ellipse
                  cx={poi.diagram.x}
                  cy={poi.diagram.y + poi.diagram.size * 0.34}
                  rx={poi.diagram.size * 0.52}
                  ry={poi.diagram.size * 0.3}
                  fill="#3E4A5A"
                />
                {/* Marble top */}
                <ellipse
                  cx={poi.diagram.x}
                  cy={poi.diagram.y}
                  rx={poi.diagram.size * 0.62}
                  ry={poi.diagram.size * 0.34}
                  fill="#C7CFD6"
                />
                <ellipse
                  cx={poi.diagram.x}
                  cy={poi.diagram.y - 1}
                  rx={poi.diagram.size * 0.5}
                  ry={poi.diagram.size * 0.26}
                  fill="#EDEAE3"
                />
                {/* Energy ring / core accent */}
                <circle
                  cx={poi.diagram.x}
                  cy={poi.diagram.y - 1}
                  r={poi.diagram.size * 0.14}
                  fill={poi.accent}
                  opacity="0.9"
                />
                {poi.id === 'wind-temple' ? (
                  <circle
                    cx={poi.diagram.x}
                    cy={poi.diagram.y - 1}
                    r={poi.diagram.size * 0.4}
                    fill="none"
                    stroke="#E3A23C"
                    strokeWidth="0.7"
                    opacity="0.85"
                  />
                ) : null}
                <text
                  x={poi.diagram.x}
                  y={poi.diagram.y + poi.diagram.size * 0.34 + 5.5}
                  textAnchor="middle"
                  fontSize="3.1"
                  fill="rgba(199,207,214,0.75)"
                  style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
                >
                  {poi.name}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="space-y-4">
          {POIS.map((poi) => (
            <div
              key={`card-${poi.id}`}
              data-reveal
              className="rounded-2xl border border-white/10 bg-storm-deep/70 p-4 backdrop-blur-xl"
              style={{ borderLeft: `2px solid ${poi.accent}` }}
            >
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-storm-marble">
                {poi.name}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-storm-mist/75">{poi.description}</p>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

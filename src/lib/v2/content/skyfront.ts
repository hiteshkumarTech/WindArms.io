/** Skyfront (map overview) section content — the board's POI panel. */

export const SKYFRONT_HEADING = {
  eyebrow: 'MAP OVERVIEW',
  title: 'THE SKYFRONT',
  subtitle: 'A megacity of floating islands. Control the structures, control the sky.',
} as const;

export interface PoiContent {
  id: string;
  name: string;
  description: string;
  accent: string;
  /** Position (percent) inside the SVG diagram, hub-and-spoke layout. */
  diagram: { x: number; y: number; size: number };
}

export const POIS: PoiContent[] = [
  {
    id: 'wind-temple',
    name: 'Wind Temple',
    description: 'Central strategic stronghold with high ground advantages.',
    accent: '#EDEAE3',
    diagram: { x: 50, y: 48, size: 16 },
  },
  {
    id: 'storm-reactor',
    name: 'Storm Reactor',
    description: 'Powerful energy hub. Control it to dominate the battle.',
    accent: '#4FC3FF',
    diagram: { x: 78, y: 30, size: 11 },
  },
  {
    id: 'sky-bridges',
    name: 'Sky Bridges',
    description: 'Connects major islands. Expect intense mid-air battles.',
    accent: '#E3A23C',
    diagram: { x: 26, y: 34, size: 10 },
  },
  {
    id: 'airship-docks',
    name: 'Airship Docks',
    description: 'Fast traversal points and vertical flanking opportunities.',
    accent: '#58B7E6',
    diagram: { x: 66, y: 72, size: 12 },
  },
];

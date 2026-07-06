import type { MapId, Vec3 } from './protocol';
import { makeStairs, type ArenaBox, type ArenaRamp } from './arena';

/**
 * Map catalog — layouts, spawns and visual themes as pure data.
 * The client renders and collides against it; the server uses the same
 * boxes for shot occlusion and spawn selection. Adding a map is adding
 * an entry here: no engine changes on either side.
 *
 * All maps share a 60×60 footprint so movement-validation bounds stay
 * uniform across rooms.
 */

export interface MapTheme {
  fogColor: string;
  fogNear: number;
  fogFar: number;
  floorColor: string;
  structureColor: string;
  platformColor: string;
  gridCellColor: string;
  gridSectionColor: string;
  /** Accent cycle for emissive strips on obstacles. */
  accents: string[];
  ambientIntensity: number;
  directional: { position: Vec3; intensity: number; color: string };
  pointLights: Array<{ position: Vec3; color: string; intensity: number; distance: number }>;
  particles: 'embers' | 'snow' | 'motes';
  showSkyline: boolean;
}

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  floor: ArenaBox;
  walls: ArenaBox[];
  /** Thin walkable surfaces. */
  platforms: ArenaBox[];
  /** Solid cover masses (pillars, bunkers, barriers). */
  obstacles: ArenaBox[];
  ramps: ArenaRamp[];
  stairs: ArenaBox[];
  spawnPoints: Vec3[];
  /** Pushable dynamic crates — client-side flavor, no server occlusion. */
  crates: Vec3[];
  theme: MapTheme;
}

const FLOOR: ArenaBox = { position: [0, -0.5, 0], size: [60, 1, 60] };

const PERIMETER_WALLS: ArenaBox[] = [
  { position: [0, 3, -30.5], size: [62, 6, 1] },
  { position: [0, 3, 30.5], size: [62, 6, 1] },
  { position: [-30.5, 3, 0], size: [1, 6, 62] },
  { position: [30.5, 3, 0], size: [1, 6, 62] },
];

const CYBER_CITY: MapDef = {
  id: 'cyber_city',
  name: 'Cyber City',
  description: 'Neon rooftop district — platform chains and long sightlines.',
  floor: FLOOR,
  walls: PERIMETER_WALLS,
  platforms: [
    { position: [-8, 1.5, -6], size: [4, 0.4, 4] },
    { position: [-8, 3, -12], size: [4, 0.4, 4] },
    { position: [8, 2, -8], size: [5, 0.4, 5] },
    { position: [8, 2, -17], size: [5, 0.4, 5] },
    { position: [0, 4.2, -18], size: [6, 0.4, 4] },
  ],
  obstacles: [
    { position: [-14, 2.5, 10], size: [1.2, 5, 1.2] },
    { position: [14, 2.5, -2], size: [1.2, 5, 1.2] },
    { position: [-4, 2.5, -14], size: [1.2, 5, 1.2] },
  ],
  ramps: [
    { position: [-2, 0.9, 6], size: [4, 0.3, 8], rotation: [-0.26, 0, 0] },
    { position: [12, 1.6, 4], size: [4, 0.3, 8], rotation: [-0.52, 0, 0] },
  ],
  stairs: makeStairs([-14, 0, -2], 8),
  spawnPoints: [
    [0, 3, 10],
    [8, 3, 8],
    [-8, 3, 8],
    [12, 3, -6],
    [-12, 3, -6],
    [0, 5, -16],
    [6, 3, 0],
    [-6, 3, 0],
  ],
  crates: [
    [3, 2.5, 2],
    [3.8, 3.6, 2.2],
    [-5, 2.5, 1],
    [10, 3.5, -3],
  ],
  theme: {
    fogColor: '#050505',
    fogNear: 30,
    fogFar: 110,
    floorColor: '#0b0f15',
    structureColor: '#0d1118',
    platformColor: '#131a24',
    gridCellColor: '#0e2f33',
    gridSectionColor: '#00F5FF',
    accents: ['#00F5FF', '#FF7A00', '#7C5CFF'],
    ambientIntensity: 0.45,
    directional: { position: [12, 18, 8], intensity: 1.3, color: '#cfeeff' },
    pointLights: [
      { position: [0, 8, 0], color: '#00F5FF', intensity: 60, distance: 40 },
      { position: [-16, 6, -16], color: '#FF7A00', intensity: 40, distance: 30 },
      { position: [16, 6, 16], color: '#7C5CFF', intensity: 40, distance: 30 },
    ],
    particles: 'embers',
    showSkyline: true,
  },
};

const SNOW_BASE: MapDef = {
  id: 'snow_base',
  name: 'Snow Base',
  description: 'Arctic outpost — bunkers, trenches of cover, one long watchtower angle.',
  floor: FLOOR,
  walls: PERIMETER_WALLS,
  platforms: [
    { position: [-11, 2.4, -11], size: [7, 0.4, 7] },
    { position: [11, 2.4, 11], size: [7, 0.4, 7] },
    { position: [14, 2.9, -14], size: [4, 0.4, 4] },
  ],
  obstacles: [
    // Bunker cores under the roof platforms (1 m ledge all round).
    { position: [-11, 1.1, -11], size: [5, 2.2, 5] },
    { position: [11, 1.1, 11], size: [5, 2.2, 5] },
    // Central barrier splitting the long lane.
    { position: [0, 1.1, 0], size: [12, 2.2, 1.2] },
    // Low covers.
    { position: [-6, 0.6, 7], size: [2.4, 1.2, 0.9] },
    { position: [6, 0.6, -7], size: [2.4, 1.2, 0.9] },
    { position: [-14, 0.6, 4], size: [2.4, 1.2, 0.9] },
    { position: [14, 0.6, -4], size: [2.4, 1.2, 0.9] },
  ],
  ramps: [
    { position: [-11, 1.1, -5.6], size: [3, 0.3, 6], rotation: [-0.37, 0, 0] },
    { position: [11, 1.1, 5.6], size: [3, 0.3, 6], rotation: [0.37, 0, 0] },
  ],
  stairs: makeStairs([14, 0, -9], 9),
  spawnPoints: [
    [-20, 3, -20],
    [20, 3, 20],
    [-20, 3, 20],
    [20, 3, -20],
    [0, 3, 22],
    [0, 3, -22],
    [22, 3, 0],
    [-22, 3, 0],
  ],
  crates: [
    [3, 2, 3],
    [-3, 2, -3],
    [8, 2, -2],
    [-8, 2, 2],
  ],
  theme: {
    fogColor: '#0e1622',
    fogNear: 22,
    fogFar: 95,
    floorColor: '#b8c9d9',
    structureColor: '#5b6b7a',
    platformColor: '#77879a',
    gridCellColor: '#4d6b85',
    gridSectionColor: '#9fd4ff',
    accents: ['#7fd8ff', '#ffffff', '#9fd4ff'],
    ambientIntensity: 0.65,
    directional: { position: [10, 20, 6], intensity: 2, color: '#eef6ff' },
    pointLights: [
      { position: [-11, 5, -11], color: '#7fd8ff', intensity: 35, distance: 26 },
      { position: [11, 5, 11], color: '#7fd8ff', intensity: 35, distance: 26 },
    ],
    particles: 'snow',
    showSkyline: false,
  },
};

const FOREST_TEMPLE: MapDef = {
  id: 'forest_temple',
  name: 'Forest Temple',
  description: 'Overgrown ruin — a contested central plinth ringed by stone.',
  floor: FLOOR,
  walls: PERIMETER_WALLS,
  platforms: [
    { position: [-12, 1.4, -12], size: [4, 0.4, 4] },
    { position: [12, 1.4, 12], size: [4, 0.4, 4] },
    { position: [-12, 1.4, 12], size: [4, 0.4, 4] },
    { position: [12, 1.4, -12], size: [4, 0.4, 4] },
  ],
  obstacles: [
    // Two-tier central plinth (top surfaces are walkable).
    { position: [0, 0.9, 0], size: [8, 1.8, 8] },
    { position: [0, 2.2, 0], size: [5, 0.8, 5] },
    // Temple pillars at the plinth corners.
    { position: [-5.5, 3, -5.5], size: [1.4, 6, 1.4] },
    { position: [5.5, 3, -5.5], size: [1.4, 6, 1.4] },
    { position: [-5.5, 3, 5.5], size: [1.4, 6, 1.4] },
    { position: [5.5, 3, 5.5], size: [1.4, 6, 1.4] },
    // Gateway walls on the mid lanes.
    { position: [0, 1.5, 14], size: [10, 3, 1] },
    { position: [0, 1.5, -14], size: [10, 3, 1] },
  ],
  ramps: [
    { position: [0, 0.9, 6.6], size: [3.4, 0.3, 5.4], rotation: [-0.34, 0, 0] },
    { position: [0, 0.9, -6.6], size: [3.4, 0.3, 5.4], rotation: [0.34, 0, 0] },
  ],
  stairs: makeStairs([-12, 0, -7], 6),
  spawnPoints: [
    [-20, 3, 0],
    [20, 3, 0],
    [0, 3, 20],
    [0, 3, -20],
    [-18, 3, -18],
    [18, 3, 18],
    [-18, 3, 18],
    [18, 3, -18],
  ],
  crates: [
    [9, 2, 0],
    [-9, 2, 0],
    [0, 2, 9.5],
    [0, 2, -9.5],
  ],
  theme: {
    fogColor: '#08120b',
    fogNear: 20,
    fogFar: 85,
    floorColor: '#152417',
    structureColor: '#33422f',
    platformColor: '#3d4f38',
    gridCellColor: '#1c3a24',
    gridSectionColor: '#34d399',
    accents: ['#34d399', '#ffd27f', '#7fd8ff'],
    ambientIntensity: 0.5,
    directional: { position: [8, 18, 4], intensity: 1.2, color: '#d8ffe8' },
    pointLights: [
      { position: [0, 6, 0], color: '#ffd27f', intensity: 50, distance: 30 },
      { position: [-14, 4, -14], color: '#34d399', intensity: 30, distance: 24 },
      { position: [14, 4, 14], color: '#34d399', intensity: 30, distance: 24 },
    ],
    particles: 'motes',
    showSkyline: false,
  },
};

export const MAPS: Record<MapId, MapDef> = {
  cyber_city: CYBER_CITY,
  snow_base: SNOW_BASE,
  forest_temple: FOREST_TEMPLE,
};

export const MAP_ORDER: MapId[] = ['cyber_city', 'snow_base', 'forest_temple'];

export const DEFAULT_MAP_ID: MapId = 'cyber_city';

/** Static geometry the server raycasts for shot occlusion (ramps excluded). */
export function occlusionBoxesFor(mapId: MapId): ArenaBox[] {
  const map = MAPS[mapId];
  return [map.floor, ...map.walls, ...map.platforms, ...map.obstacles, ...map.stairs];
}

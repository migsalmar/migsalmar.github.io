// World units are meters. +Y is up, the valley runs along Z (north is -Z), east is +X.
// Proportions are an artistic reading of the Vale do Anhangabaú, not a survey.

export const VALLEY = {
  halfWidth: 34, // walkable valley floor spans |x| <= halfWidth
  zMin: -240,
  zMax: 240,
  ridgeY: 20, // street level of both ridges (Centro Velho to the east, Centro Novo to the west)
};

export const VIADUCT = {
  z: 0,
  halfWidth: 8, // structural half width of the deck
  walkHalfWidth: 6.9, // inside the railings
  deckY: 20,
  xMin: -66,
  xMax: 66,
  piersX: [-17, 17],
};

// Grand staircase on the west side, rising north from the valley floor to the viaduct deck.
export const STAIRS = {
  x0: -33.2,
  x1: -26.2,
  zTop: 8,
  zBottom: 58,
};

// Landmarks
export const MARTINELLI = { x0: 35, x1: 74, z0: -86, z1: -46, height: 112 };
export const BANDEIRA = { x0: -78, x1: -36, z0: 22, z1: 58, height: 268 };

// Fixed camera positions used for review screenshots and the 1/2/3 keys.
export const VIEWPOINTS = [
  { name: 'Vale', pos: [5, 1.7, 128], target: [-4, 30, 0] },
  { name: 'Viaduto', pos: [-32.5, 21.7, -6.3], target: [40, 52, -66] },
  { name: 'Céu', pos: [20, 1.7, 88], target: [-38, 105, 30] },
];

export const EYE_HEIGHT = 1.7;

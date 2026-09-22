// Die geometry tables — threejs-dice lineage (MIT, byWulf/threejs-dice, after Anton Natarov's teall roller).
// Each entry: vertices (unit-ish), faces as [v0, v1, ..., label] where label -1 = unlabeled band face.
// Values are sequential by face label (toy simplification: no opposite-faces-sum layout).

const P = (1 + Math.sqrt(5)) / 2;
const Q = 1 / P;

export const DICE_DATA = {
  d4: {
    vertices: [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]],
    faces: [[1, 0, 2, 1], [0, 1, 3, 2], [0, 3, 2, 3], [1, 2, 3, 4]],
    scale: 1.15,
    vertexValues: [1, 2, 3, 4], // d4 reads the UP VERTEX
    mass: 1,
  },
  d6: {
    vertices: [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ],
    faces: [
      [0, 3, 2, 1, 1], [1, 2, 6, 5, 2], [0, 1, 5, 4, 3],
      [3, 7, 6, 2, 4], [0, 4, 7, 3, 5], [4, 5, 6, 7, 6],
    ],
    scale: 0.92,
    mass: 1,
  },
  d8: {
    vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    faces: [
      [0, 2, 4, 1], [0, 4, 3, 2], [0, 3, 5, 3], [0, 5, 2, 4],
      [1, 3, 4, 5], [1, 4, 2, 6], [1, 2, 5, 7], [1, 5, 3, 8],
    ],
    scale: 1.0,
    mass: 1,
  },
  d10: (() => {
    // true pentagonal trapezohedron: 10 planar kite quads.
    // planarity fixes the rim height at (1 - cos36) / (1 + cos36) ~= 0.1056 for unit poles.
    const c36 = Math.cos(Math.PI / 5);
    const h = (1 - c36) / (1 + c36);
    const vertices = [];
    for (let k = 0; k < 10; k++) {
      const a = (Math.PI * 2 * k) / 10;
      vertices.push([Math.cos(a), h * (k % 2 === 0 ? 1 : -1), Math.sin(a)]);
    }
    vertices.push([0, -1, 0]); // 10: bottom pole
    vertices.push([0, 1, 0]);  // 11: top pole
    const faces = [];
    let label = 1;
    for (let k = 1; k < 10; k += 2) { // top kites: tip below equator, sides above
      faces.push([11, (k + 9) % 10, k, (k + 1) % 10, label++]);
    }
    for (let k = 0; k < 10; k += 2) { // bottom kites
      faces.push([10, (k + 9) % 10, k, (k + 1) % 10, label++]);
    }
    return { vertices, faces, scale: 0.95, mass: 1, noNormalize: true };
  })(),
  d12: {
    vertices: [
      [0, Q, P], [0, Q, -P], [0, -Q, P], [0, -Q, -P], [P, 0, Q],
      [P, 0, -Q], [-P, 0, Q], [-P, 0, -Q], [Q, P, 0], [Q, -P, 0],
      [-Q, P, 0], [-Q, -P, 0], [1, 1, 1], [1, 1, -1], [1, -1, 1],
      [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    ],
    faces: [
      [2, 14, 4, 12, 0, 1], [15, 9, 11, 19, 3, 2], [16, 10, 17, 7, 6, 3], [6, 7, 19, 11, 18, 4],
      [6, 18, 2, 0, 16, 5], [18, 11, 9, 14, 2, 6], [1, 17, 10, 8, 13, 7], [1, 13, 5, 15, 3, 8],
      [13, 8, 12, 4, 5, 9], [5, 4, 14, 9, 15, 10], [0, 12, 8, 10, 16, 11], [3, 19, 7, 17, 1, 12],
    ],
    scale: 0.9,
    mass: 1,
  },
  d20: (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    return {
      vertices: [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
        [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
      ],
      faces: [
        [0, 11, 5, 1], [0, 5, 1, 2], [0, 1, 7, 3], [0, 7, 10, 4], [0, 10, 11, 5],
        [1, 5, 9, 6], [5, 11, 4, 7], [11, 10, 2, 8], [10, 7, 6, 9], [7, 1, 8, 10],
        [3, 9, 4, 11], [3, 4, 2, 12], [3, 2, 6, 13], [3, 6, 8, 14], [3, 8, 9, 15],
        [4, 9, 5, 16], [2, 4, 11, 17], [6, 2, 10, 18], [8, 6, 7, 19], [9, 8, 1, 20],
      ],
      scale: 1.0,
      mass: 1,
    };
  })(),
};

export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

// Per-type color themes: [body, number]
export const DIE_THEMES = {
  d4: ['#2dd4bf', '#06322c'],
  d6: ['#efe9dc', '#2b2116'],
  d8: ['#f97316', '#3d1503'],
  d10: ['#a78bfa', '#241148'],
  d12: ['#f43f5e', '#3e0413'],
  d20: ['#eab308', '#382702'],
};

export function maxValue(type) {
  return parseInt(type.slice(1), 10);
}

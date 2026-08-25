// Mapa de densidad poblacional — portado de `DensidadView` del prototipo:
// un diagrama de Voronoi entre los puntos de muestreo (cada celda = "el área
// más cercana a este punto que a cualquier otro"), recortado al perímetro
// real del lote, coloreado según el conteo de cada punto llevado a m².
//
// No se porta la imagen satelital (necesitaría contratar un proveedor de
// mapas con API key — pendiente de decidir con el usuario) ni `maxVal`
// (llegaba como prop a DensidadView del prototipo pero nunca se usaba ahí).

import { Delaunay } from "d3-delaunay";
import type { XY } from "./geometria";

export type Plaga = "bicho" | "babosa";

export interface RangoDensidad {
  max: number;
  label: string;
}

// Rangos de clasificación tal como en los informes reales del prototipo
// (valores ya llevados a m² = conteo cargado × 4, porque se cuenta en
// cuadrantes de 1/4 m²).
export const RANGOS_BICHO: RangoDensidad[] = [
  { max: 30, label: "0 - 30" },
  { max: 59, label: "31 - 59" },
  { max: 120, label: "60 - 120" },
  { max: 180, label: "121 - 180" },
  { max: 240, label: "181 - 240" },
  { max: 360, label: "241 - 360" },
  { max: Infinity, label: "> 360" },
];

export const RANGOS_BABOSA: RangoDensidad[] = [
  { max: 3, label: "0 - 3" },
  { max: 8, label: "4 - 8" },
  { max: 16, label: "9 - 16" },
  { max: 24, label: "17 - 24" },
  { max: 32, label: "25 - 32" },
  { max: 64, label: "33 - 64" },
  { max: Infinity, label: "> 64" },
];

// Blanco (nada) hasta rojo oscuro (mucho) — mismos 7 colores del prototipo,
// uno por cada rango de arriba.
export const NIVEL_COLORES = [
  "#FFFFFF",
  "#FFF4B8",
  "#FFD93D",
  "#FFA726",
  "#F4511E",
  "#D32F2F",
  "#8E0000",
];

export function rangosDe(plaga: Plaga): RangoDensidad[] {
  return plaga === "bicho" ? RANGOS_BICHO : RANGOS_BABOSA;
}

export function clasificarNivel(valorM2: number, rangos: RangoDensidad[]): number {
  const i = rangos.findIndex((r) => valorM2 <= r.max);
  return i === -1 ? rangos.length - 1 : i;
}

/** Casco convexo (Andrew monotone chain) — portado tal cual del prototipo. */
export function cascoConvexo(pts: XY[]): XY[] {
  const vistos = new Set<string>();
  const unicos: XY[] = [];
  for (const p of pts) {
    const clave = `${p.x}|${p.y}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicos.push(p);
  }
  unicos.sort((a, b) => a.x - b.x || a.y - b.y);
  if (unicos.length <= 2) return unicos;

  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: XY[] = [];
  for (const p of unicos) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = unicos.length - 1; i >= 0; i--) {
    const p = unicos[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

type Tupla = [number, number];

/** Sutherland-Hodgman: recorta un polígono contra un polígono convexo (el
 * casco real del lote) — portado tal cual del prototipo. */
export function clipPoligonoConvexo(sujeto: Tupla[], clip: Tupla[]): Tupla[] {
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sentido = area >= 0 ? 1 : -1;

  let output = sujeto;
  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) break;
    const cA = clip[i];
    const cB = clip[(i + 1) % clip.length];
    const dentro = (p: Tupla) =>
      sentido * ((cB[0] - cA[0]) * (p[1] - cA[1]) - (cB[1] - cA[1]) * (p[0] - cA[0])) >= 0;
    const inter = (p1: Tupla, p2: Tupla): Tupla => {
      const x1 = cA[0],
        y1 = cA[1],
        x2 = cB[0],
        y2 = cB[1];
      const x3 = p1[0],
        y3 = p1[1],
        x4 = p2[0],
        y4 = p2[1];
      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (denom === 0) return p2;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j - 1 + input.length) % input.length];
      const curIn = dentro(cur);
      const prevIn = dentro(prev);
      if (curIn) {
        if (!prevIn) output.push(inter(prev, cur));
        output.push(cur);
      } else if (prevIn) {
        output.push(inter(prev, cur));
      }
    }
  }
  return output;
}

export interface CeldaDensidad {
  id: string;
  poligono: XY[]; // en el mismo plano x,y (metros) que puntos y perímetro
  valorM2: number;
  nivel: number; // índice en NIVEL_COLORES / rangos
}

/** Calcula, para cada punto de muestreo, su celda de Voronoi recortada al
 * perímetro real del lote (no a la caja que lo envuelve) — portado de
 * `resultadoCeldas` en DensidadView del prototipo. */
export function calcularCeldasDensidad(
  puntos: Array<{ id: string; x: number; y: number; valor: number }>,
  perimetro: XY[],
  rangos: RangoDensidad[]
): CeldaDensidad[] {
  if (puntos.length === 0 || perimetro.length < 3) return [];

  const xs = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
  const ys = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const delaunay = Delaunay.from(
    puntos,
    (p) => p.x,
    (p) => p.y
  );
  const pad = 200; // margen generoso en metros — evita celdas mal recortadas en el borde del bounds
  const voronoi = delaunay.voronoi([minX - pad, minY - pad, maxX + pad, maxY + pad]);
  const hullClip: Tupla[] = cascoConvexo(perimetro).map((v) => [v.x, v.y]);

  const celdas: CeldaDensidad[] = [];
  puntos.forEach((p, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return;
    const recortada = clipPoligonoConvexo(cell as Tupla[], hullClip);
    if (recortada.length < 3) return;
    celdas.push({
      id: p.id,
      poligono: recortada.map(([x, y]) => ({ x, y })),
      valorM2: p.valor,
      nivel: clasificarNivel(p.valor, rangos),
    });
  });
  return celdas;
}

const ESCALAS_CANDIDATAS_M = [25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];

/** Elige cuántos metros representar en la barra de escala gráfica, de forma
 * que en pantalla mida entre 40 y 130px — portado del prototipo. */
export function elegirEscalaBarra(pxPorMetro: number): { metros: number; px: number } {
  let mejor = ESCALAS_CANDIDATAS_M[0];
  let mejorDif = Infinity;
  for (const m of ESCALAS_CANDIDATAS_M) {
    const px = m * pxPorMetro;
    if (px < 40 || px > 130) continue;
    const dif = Math.abs(px - 85);
    if (dif < mejorDif) {
      mejorDif = dif;
      mejor = m;
    }
  }
  return { metros: mejor, px: mejor * pxPorMetro };
}

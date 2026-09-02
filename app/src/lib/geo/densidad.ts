// Mapa de densidad poblacional — portado de `DensidadView` del prototipo:
// un diagrama de Voronoi entre los puntos de muestreo (cada celda = "el área
// más cercana a este punto que a cualquier otro"), recortado al perímetro
// real del lote, coloreado según el conteo de cada punto llevado a m².
//
// La imagen satelital de fondo va aparte, en lib/geo/satelital.ts (Esri
// World Imagery, gratuita, sin API key — mismo servicio que ya usaba el
// prototipo). No se porta `maxVal` (llegaba como prop a DensidadView del
// prototipo pero nunca se usaba ahí).

import { Delaunay } from "d3-delaunay";
import { cascoConvexo, indicePiezaMasCercana, puntoEnPoligono, type XY } from "./geometria";

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
 * `resultadoCeldas` en DensidadView del prototipo.
 *
 * `piezas` es una lista de piezas de terreno (casi siempre una sola; más de
 * una si el campo tiene lotes no contiguos, ver geometria.ts). El Voronoi
 * se calcula UNA vez sobre todos los puntos juntos (son sitios reales, da
 * igual en qué pieza estén), pero cada celda se recorta solo contra el
 * casco convexo de SU PROPIA pieza — nunca contra el casco de otra, ni
 * contra uno global que abarque todas: con piezas separadas, un casco
 * convexo global "rellenaría" el hueco vacío entre ellas con celdas de
 * densidad que no corresponden a ningún terreno real. */
export function calcularCeldasDensidad(
  puntos: Array<{ id: string; x: number; y: number; valor: number }>,
  piezas: XY[][],
  rangos: RangoDensidad[]
): CeldaDensidad[] {
  const piezasValidas = piezas.filter((pz) => pz.length >= 3);
  if (puntos.length === 0 || piezasValidas.length === 0) return [];

  const perimetroCompleto = piezasValidas.flat();
  const xs = puntos.map((p) => p.x).concat(perimetroCompleto.map((v) => v.x));
  const ys = puntos.map((p) => p.y).concat(perimetroCompleto.map((v) => v.y));
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
  const hullsPorPieza: Tupla[][] = piezasValidas.map((pz) => cascoConvexo(pz).map((v): Tupla => [v.x, v.y]));

  const celdas: CeldaDensidad[] = [];
  puntos.forEach((p, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return;
    // A qué pieza pertenece este punto — normalmente cae adentro de una
    // sola; si por un empate/redondeo no cae claramente adentro de
    // ninguna, se usa la pieza más cercana en vez de descartarlo.
    let indicePieza = piezasValidas.findIndex((pz) => puntoEnPoligono(p.x, p.y, pz));
    if (indicePieza === -1) indicePieza = indicePiezaMasCercana(p, piezasValidas);
    const recortada = clipPoligonoConvexo(cell as Tupla[], hullsPorPieza[indicePieza]);
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
 * que en pantalla mida entre 30 y 95px (achicada a pedido del usuario —
 * antes apuntaba a 85px de centro, quedaba grande al lado de la leyenda). */
export function elegirEscalaBarra(pxPorMetro: number): { metros: number; px: number } {
  let mejor = ESCALAS_CANDIDATAS_M[0];
  let mejorDif = Infinity;
  for (const m of ESCALAS_CANDIDATAS_M) {
    const px = m * pxPorMetro;
    if (px < 30 || px > 95) continue;
    const dif = Math.abs(px - 60);
    if (dif < mejorDif) {
      mejorDif = dif;
      mejor = m;
    }
  }
  return { metros: mejor, px: mejor * pxPorMetro };
}

export interface SegmentoEscala {
  anchoPx: number;
  color: "#000000" | "#FFFFFF";
}
export interface EtiquetaEscala {
  texto: string;
  posicionPx: number;
}
export interface EscalaGraduada {
  segmentos: SegmentoEscala[];
  etiquetas: EtiquetaEscala[];
  anchoTotalPx: number;
}

/** Barra de escala graduada tipo regla topográfica (como la que usa el
 * usuario en sus informes reales, hechos con ArcGIS): el primer cuarto
 * queda subdividido en dos octavos — da una lectura más fina cerca del
 * cero — y el resto son tres cuartos completos, alternando blanco y
 * negro. Etiquetas en 0, 1/8, 1/4, 1/2, 3/4 y el total. */
export function graduarEscalaBarra(metros: number, px: number): EscalaGraduada {
  const anchoOctavo = px / 8;
  const anchoCuarto = px / 4;
  const segmentos: SegmentoEscala[] = [
    { anchoPx: anchoOctavo, color: "#000000" },
    { anchoPx: anchoOctavo, color: "#FFFFFF" },
    { anchoPx: anchoCuarto, color: "#000000" },
    { anchoPx: anchoCuarto, color: "#FFFFFF" },
    { anchoPx: anchoCuarto, color: "#000000" },
  ];
  const fracciones = [0, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1];
  const etiquetas: EtiquetaEscala[] = fracciones.map((f, i) => ({
    texto: i === fracciones.length - 1 ? `${Math.round(metros * f)} m` : String(Math.round(metros * f)),
    posicionPx: px * f,
  }));
  return { segmentos, etiquetas, anchoTotalPx: px };
}

/** Puntos (en un viewBox cuadrado de 36×36) de los 4 "picos" de una rosa de
 * los vientos clásica — blanco y negro alternados, mismos 4 puntos que
 * comparten `MapaDensidad` (pantalla) y `construirMapaDensidadHtml` (PDF)
 * para que se vean idénticos. */
export const ROSA_VIENTOS_KITES: Array<{ puntos: XY[]; color: "#000000" | "#FFFFFF" }> = [
  {
    color: "#000000",
    puntos: [
      { x: 18, y: 18 },
      { x: 21.18, y: 14.82 },
      { x: 18, y: 5 },
      { x: 14.82, y: 14.82 },
    ],
  },
  {
    color: "#FFFFFF",
    puntos: [
      { x: 18, y: 18 },
      { x: 21.18, y: 21.18 },
      { x: 31, y: 18 },
      { x: 21.18, y: 14.82 },
    ],
  },
  {
    color: "#000000",
    puntos: [
      { x: 18, y: 18 },
      { x: 14.82, y: 21.18 },
      { x: 18, y: 31 },
      { x: 21.18, y: 21.18 },
    ],
  },
  {
    color: "#FFFFFF",
    puntos: [
      { x: 18, y: 18 },
      { x: 14.82, y: 14.82 },
      { x: 5, y: 18 },
      { x: 14.82, y: 21.18 },
    ],
  },
];

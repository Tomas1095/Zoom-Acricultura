// Mapa de densidad poblacional — portado de `DensidadView` del prototipo:
// un diagrama de Voronoi (cada celda es "el área más cercana a este punto
// que a cualquier otro"), recortado al perímetro real del lote. Es el
// mismo criterio que usa la herramienta "Voronoi Map" de Geostatistical
// Analyst en ArcGIS, que es la que el usuario usa para sus informes
// reales — con puntos en una grilla bien regular (como los suyos), un
// Voronoi da celdas que se ven cuadradas, así que el resultado ya
// coincide con lo que él espera sin tener que armar un cuadriculado a
// mano.
//
// El recorte contra el perímetro respeta piezas cóncavas (p.ej. un
// entrante para excluir un pivote de riego) sin partir cada celda en
// fragmentos — ver el comentario de `calcularCeldasDensidad`.
//
// La imagen satelital de fondo va aparte, en lib/geo/satelital.ts (Esri
// World Imagery, gratuita, sin API key — mismo servicio que ya usaba el
// prototipo). No se porta `maxVal` (llegaba como prop a DensidadView del
// prototipo pero nunca se usaba ahí).

import { Delaunay } from "d3-delaunay";
import { intersection as interseccionPoligonos, union as unionPoligonos } from "polygon-clipping";
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

type Tupla = [number, number];

export interface CeldaDensidad {
  id: string;
  poligono: XY[]; // en el mismo plano x,y (metros) que puntos y perímetro
  valorM2: number;
  nivel: number; // índice en NIVEL_COLORES / rangos
  /** Si el punto de origen de esta celda tiene datos cargados. Solo lo usa
   * hoy la exportación "Manchón + Mapa" (ver manchon-mapa-kmz.ts, a pedido
   * del usuario): ahí las celdas sin dato quedan sin relleno en el KMZ,
   * para que se vea la foto satelital de Google Earth de fondo en las
   * zonas todavía no muestreadas. Sin `cargado` en el punto de entrada
   * (los demás llamadores no lo pasan, ver calcularCeldasDensidad más
   * abajo) se asume `true` — mismo comportamiento de siempre. */
  cargado: boolean;
}

/** Calcula, para cada punto de muestreo, su celda de Voronoi ("el área más
 * cercana a este punto que a cualquier otro" — mismo criterio que la
 * herramienta "Voronoi Map" de Geostatistical Analyst en ArcGIS, que es la
 * que usa el usuario para sus informes reales) recortada al perímetro real
 * del lote, sin dejar huecos — portado de `resultadoCeldas` en
 * DensidadView del prototipo.
 *
 * `piezas` es una lista de piezas de terreno (casi siempre una sola; más de
 * una si el campo tiene partes no contiguas — separadas por un camino, una
 * cortina de árboles, un arroyo, etc. — ver geometria.ts). El Voronoi se
 * calcula UNA vez sobre todos los puntos juntos (son sitios reales, da
 * igual en qué pieza estén), y cada celda se recorta contra la UNIÓN de
 * TODAS las piezas juntas, no solo contra la propia — a propósito: un
 * punto de muestreo pegado al borde de su pieza, con otra pieza justo al
 * lado (caso real de un usuario, con el lote partido en varias piezas por
 * los deslindes del KMZ), tiene que poder "pintar" un poco de esa pieza
 * vecina también si ella no tiene puntos propios ahí cerca — si no, esa
 * franja queda para siempre sin color aunque sea parte del mismo lote.
 * Como el Voronoi de cada punto ya está naturalmente acotado por sus
 * vecinos más cercanos (y, en el borde exterior del conjunto de puntos,
 * por el margen `pad` de abajo), esto no "rellena" agujeros lejanos de
 * verdad — solo dejaba sin pintar franjas que en la práctica están pegadas
 * a puntos con datos reales.
 *
 * El recorte usa `polygon-clipping` (algoritmo Martinez-Rueda-Feito, la
 * misma familia que usan QGIS/ArcGIS por dentro para esto) en vez de un
 * Sutherland-Hodgman casero — se probaron DOS variantes propias antes de
 * esta (recortar la celda contra la pieza triangulada, y al revés,
 * recortar la pieza cóncava directo contra la celda) y las dos fallaban
 * justo cerca de un entrante cóncavo (p.ej. el hueco dejado a propósito
 * para excluir un pivote de riego, caso real de un usuario): Sutherland-
 * Hodgman solo da un resultado correcto si el polígono de recorte es
 * convexo Y el recortado nunca queda partido en más de un pedazo al
 * cortarlo — cerca de un entrante eso deja de cumplirse (el corte puede
 * partir la celda en dos o más regiones separadas), y el algoritmo casero
 * arma un solo polígono igual, con bordes que se cruzan entre sí — eso es
 * lo que se veía como huecos/triángulos sueltos en el mapa. Una librería
 * de boolean ops de polígonos como esta calcula la intersección real
 * (celda de Voronoi ∩ pieza) sin esa limitación, devolviendo la cantidad
 * de polígonos simples que corresponda (normalmente 1; excepcionalmente
 * más de 1 si una celda queda genuinamente partida por un entrante).
 *
 * Como el recorte va contra la unión de todas las piezas (ver arriba), un
 * punto de "borde" (sin otro punto de un lado que lo frene) podría
 * terminar derramando color sobre una pieza realmente lejana y sin
 * relación (un lote distinto, del otro lado del padding de más abajo) —
 * para evitar eso, cada celda además se recorta contra un círculo
 * centrado en el punto, con radio proporcional a la distancia a su vecino
 * más cercano (ver `FACTOR_RADIO_MAXIMO`): así solo puede "asomar" a una
 * pieza vecina pegada de verdad, nunca a una lejana. */
const FACTOR_RADIO_MAXIMO = 1.5;

function circulo(cx: number, cy: number, r: number, lados = 24): Tupla[] {
  const pts: Tupla[] = [];
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function calcularCeldasDensidad(
  puntos: Array<{ id: string; x: number; y: number; valor: number; cargado?: boolean }>,
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

  // Formato que espera polygon-clipping: un Polygon es una lista de
  // anillos (Ring[]), el primero el contorno exterior — acá siempre un
  // solo anillo, sin agujeros propios (los agujeros del lote, si los hay,
  // ya vienen resueltos como el "entrante" de la pieza misma). Unión de
  // TODAS las piezas en un solo MultiPolygon — ver el comentario de arriba
  // sobre por qué el recorte va contra esto y no contra la pieza de cada
  // punto en particular.
  const piezasPoly: Tupla[][][] = piezasValidas.map((pz) => [pz.map((v): Tupla => [v.x, v.y])]);
  const piezasUnion = unionPoligonos(piezasPoly[0], ...piezasPoly.slice(1));

  const celdas: CeldaDensidad[] = [];
  puntos.forEach((p, i) => {
    const celda = voronoi.cellPolygon(i);
    if (!celda) return;

    // Distancia al vecino Delaunay más cercano — el propio triangulado ya
    // conecta a cada punto con su vecino más próximo, así que no hace
    // falta comparar contra TODOS los demás puntos.
    let dVecino = Infinity;
    for (const j of delaunay.neighbors(i)) {
      const d = Math.hypot(p.x - puntos[j].x, p.y - puntos[j].y);
      if (d < dVecino) dVecino = d;
    }

    const celdaPoly: Tupla[][] = [celda as Tupla[]];
    const interseccion = Number.isFinite(dVecino)
      ? interseccionPoligonos(celdaPoly, piezasUnion, [circulo(p.x, p.y, dVecino * FACTOR_RADIO_MAXIMO)])
      : interseccionPoligonos(celdaPoly, piezasUnion);
    interseccion.forEach((poligono, r) => {
      const anilloExterior = poligono[0]; // sin agujeros propios en este caso, ver arriba
      if (!anilloExterior || anilloExterior.length < 3) return;
      celdas.push({
        id: interseccion.length > 1 ? `${p.id}-${r}` : p.id,
        poligono: anilloExterior.map(([x, y]) => ({ x, y })),
        valorM2: p.valor,
        nivel: clasificarNivel(p.valor, rangos),
        cargado: p.cargado ?? true,
      });
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

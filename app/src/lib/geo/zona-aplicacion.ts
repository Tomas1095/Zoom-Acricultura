// Zona de aplicación de cebo ("manchoneo") — portado de `calcularZonaAplicacion`
// del prototipo, pensado sobre todo para babosas (distribución típicamente
// sectorizada, a diferencia de bichos bolita). Regla: estaciones con valor
// por encima del umbral, con relleno de "agujeros rodeados" entre estaciones
// afectadas cercanas, más una franja de protección alrededor del borde real
// del lote.
//
// Una diferencia real con el prototipo: ahí el espaciado entre estaciones
// estaba hardcodeado (`SPACING_M = 122.47`, "1 punto cada 1.5 ha" fijo, el
// único lote de la demo). Acá cada lote tiene su propio `haPorPunto`, así
// que el espaciado se recibe como parámetro, calculado con la misma fórmula
// que generó la grilla real (ver `generarGrillaDesdePerimetro` en
// geometria.ts: `Math.sqrt(haPorPunto * 10000)`).

import { puntoEnPoligono, type XY } from "./geometria";

export const UMBRAL_APLICACION_BABOSA = 4; // babosas/m² — arranque de la 2da categoría (ver RANGOS_BABOSA)
export const FRANJA_PROTECCION_M = 60;
const RASTER_RES_M = 12; // resolución de la grilla de cálculo, en metros

export interface EstacionAplicacion {
  id: string;
  x: number;
  y: number;
  linea: number;
  puntoNum: number;
  valorM2: number;
}

function radioVecino(spacingM: number): number {
  return spacingM * 1.6; // cubre vecinos ortogonales y diagonales
}

/** Estaciones "afectadas" (>= umbral) + relleno de huecos rodeados —
 * portado tal cual de `estacionesSeleccionadas` del prototipo. Una estación
 * sin plaga se suma si TODOS sus vecinos reales (por proximidad, según el
 * espaciado real de la grilla) ya están seleccionados; se aplica en pasadas
 * sucesivas por si rellenar una deja "rodeada" a otra. */
export function estacionesSeleccionadas(
  estaciones: EstacionAplicacion[],
  umbral: number,
  spacingM: number
): Set<string> {
  const seleccionadas = new Set(estaciones.filter((e) => e.valorM2 >= umbral).map((e) => e.id));
  const radio = radioVecino(spacingM);

  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    for (const e of estaciones) {
      if (seleccionadas.has(e.id)) continue;
      const vecinos = estaciones.filter((o) => o.id !== e.id && Math.hypot(o.x - e.x, o.y - e.y) <= radio);
      if (vecinos.length > 0 && vecinos.every((v) => seleccionadas.has(v.id))) {
        seleccionadas.add(e.id);
        cambiado = true;
      }
    }
  }
  return seleccionadas;
}

function rotarPunto(x: number, y: number, th: number): XY {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Ángulo real de la grilla de muestreo: la línea con más puntos, mirando
 * del primero al último punto de esa línea — portado de `anguloGrilla`. */
function anguloGrilla(estaciones: EstacionAplicacion[]): number {
  const porLinea = new Map<number, EstacionAplicacion[]>();
  for (const e of estaciones) {
    if (!porLinea.has(e.linea)) porLinea.set(e.linea, []);
    porLinea.get(e.linea)!.push(e);
  }
  let mejor: EstacionAplicacion[] | null = null;
  for (const fila of porLinea.values()) {
    if (!mejor || fila.length > mejor.length) mejor = fila;
  }
  if (!mejor || mejor.length < 2) return 0;
  const ordenada = [...mejor].sort((a, b) => a.puntoNum - b.puntoNum);
  const p0 = ordenada[0];
  const p1 = ordenada[ordenada.length - 1];
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/** Traza el contorno tipo "escalera" (bordes rectos, alineados a la grilla)
 * de un conjunto de celdas incluidas, simplificado juntando segmentos
 * colineales — portado tal cual de `trazarContornoEscalera`. Trabaja en el
 * marco de índices de celda × resolución (u,v), no en metros reales. */
function trazarContornoEscalera(celdasIncluidas: Set<string>, resolucion: number): XY[][] {
  const esquina = (ci: number, ri: number): XY => ({ x: ci * resolucion, y: ri * resolucion });
  const edgeMap = new Map<string, XY>();
  const addEdge = (a: XY, b: XY) => edgeMap.set(`${a.x},${a.y}`, b);

  celdasIncluidas.forEach((key) => {
    const [ci, ri] = key.split(",").map(Number);
    if (!celdasIncluidas.has(`${ci},${ri - 1}`)) addEdge(esquina(ci, ri), esquina(ci + 1, ri)); // arriba
    if (!celdasIncluidas.has(`${ci},${ri + 1}`)) addEdge(esquina(ci + 1, ri + 1), esquina(ci, ri + 1)); // abajo
    if (!celdasIncluidas.has(`${ci - 1},${ri}`)) addEdge(esquina(ci, ri + 1), esquina(ci, ri)); // izquierda
    if (!celdasIncluidas.has(`${ci + 1},${ri}`)) addEdge(esquina(ci + 1, ri), esquina(ci + 1, ri + 1)); // derecha
  });

  const visitados = new Set<string>();
  const loops: XY[][] = [];
  edgeMap.forEach((_v, startKey) => {
    if (visitados.has(startKey)) return;
    const loop: XY[] = [];
    let curKey = startKey;
    do {
      if (visitados.has(curKey)) break;
      visitados.add(curKey);
      const [cx, cy] = curKey.split(",").map(Number);
      loop.push({ x: cx, y: cy });
      const next = edgeMap.get(curKey);
      if (!next) break;
      curKey = `${next.x},${next.y}`;
    } while (curKey !== startKey);
    if (loop.length >= 3) loops.push(loop);
  });

  // simplificar: sacar vértices colineales (donde el contorno sigue derecho)
  return loops.map((loop) => {
    const n = loop.length;
    return loop.filter((b, i) => {
      const a = loop[(i - 1 + n) % n];
      const c = loop[(i + 1) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      return Math.abs(cross) > 1e-6;
    });
  });
}

export interface ZonaAplicacionResultado {
  /** Uno o más polígonos ("manchones") — un lote puede necesitar varias
   * zonas separadas si las estaciones afectadas están en sectores lejanos. */
  manchones: XY[][];
  haIncluidas: number;
  seleccionadas: Set<string>;
}

/** Calcula el/los polígono(s) de aplicación de cebo — portado de
 * `calcularZonaAplicacion`. Trabaja en un marco rotado, alineado a la
 * orientación real de las líneas de muestreo, para que el contorno tenga
 * bordes rectos en el mismo sentido que la grilla (nada de diagonales
 * sueltas), y después vuelve al plano x,y original. */
export function calcularZonaAplicacion(
  estaciones: EstacionAplicacion[],
  umbral: number,
  perimetro: XY[],
  spacingM: number
): ZonaAplicacionResultado {
  const seleccionadas = estacionesSeleccionadas(estaciones, umbral, spacingM);
  if (estaciones.length === 0 || perimetro.length < 3) {
    return { manchones: [], haIncluidas: 0, seleccionadas };
  }

  const theta = anguloGrilla(estaciones);
  const estacionesR = estaciones.map((e) => ({ ...e, ...rotarPunto(e.x, e.y, -theta) }));
  const perimetroR = perimetro.map((v) => rotarPunto(v.x, v.y, -theta));

  const us = perimetroR.map((v) => v.x);
  const vs = perimetroR.map((v) => v.y);
  const minU = Math.min(...us) - FRANJA_PROTECCION_M;
  const maxU = Math.max(...us) + FRANJA_PROTECCION_M;
  const minV = Math.min(...vs) - FRANJA_PROTECCION_M;
  const maxV = Math.max(...vs) + FRANJA_PROTECCION_M;

  const nCols = Math.ceil((maxU - minU) / RASTER_RES_M);
  const nRows = Math.ceil((maxV - minV) / RASTER_RES_M);
  const incluidaGrid = new Set<string>();
  let celdasIncluidas = 0;
  const radioTotal = spacingM / 2 + FRANJA_PROTECCION_M;

  for (let ci = 0; ci < nCols; ci++) {
    for (let ri = 0; ri < nRows; ri++) {
      const cu = minU + ci * RASTER_RES_M + RASTER_RES_M / 2;
      const cv = minV + ri * RASTER_RES_M + RASTER_RES_M / 2;
      if (!puntoEnPoligono(cu, cv, perimetroR)) continue;
      const incluida = estacionesR.some(
        (e) => seleccionadas.has(e.id) && Math.max(Math.abs(cu - e.x), Math.abs(cv - e.y)) <= radioTotal
      );
      if (incluida) {
        incluidaGrid.add(`${ci},${ri}`);
        celdasIncluidas++;
      }
    }
  }

  // componentes conexas (flood fill 4-conexo) — cada una es un "manchón" separado
  const visitado = new Set<string>();
  const componentes: Set<string>[] = [];
  for (const key of incluidaGrid) {
    if (visitado.has(key)) continue;
    const pila = [key];
    const comp = new Set<string>();
    while (pila.length) {
      const k = pila.pop()!;
      if (visitado.has(k)) continue;
      visitado.add(k);
      comp.add(k);
      const [ci, ri] = k.split(",").map(Number);
      for (const [dci, dri] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nk = `${ci + dci},${ri + dri}`;
        if (incluidaGrid.has(nk) && !visitado.has(nk)) pila.push(nk);
      }
    }
    componentes.push(comp);
  }

  const manchones: XY[][] = [];
  for (const comp of componentes) {
    const contornos = trazarContornoEscalera(comp, RASTER_RES_M);
    for (const loopUV of contornos) {
      // volvemos del marco de celdas (índices * resolución + offset) al real (x,y)
      const enUV = loopUV.map((v) => ({ x: minU + v.x, y: minV + v.y }));
      const enXY = enUV.map((v) => rotarPunto(v.x, v.y, theta));
      manchones.push(enXY);
    }
  }

  const haIncluidas = (celdasIncluidas * RASTER_RES_M * RASTER_RES_M) / 10000;
  return { manchones, haIncluidas, seleccionadas };
}

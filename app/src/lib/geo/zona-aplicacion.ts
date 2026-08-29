// Zona de aplicación de cebo ("manchoneo") — portado de `calcularZonaAplicacion`
// del prototipo, pensado originalmente para babosas (distribución típicamente
// sectorizada, a diferencia de bichos bolita) pero hoy usado igual para las
// dos plagas (ver Manchoneo en salidas-view.tsx, con una subsolapa por
// plaga). Regla: estaciones con valor por encima del umbral, con relleno de
// "agujeros rodeados" entre estaciones afectadas cercanas, más una franja de
// protección alrededor del borde real del lote.
//
// Una diferencia real con el prototipo: ahí el espaciado entre estaciones
// estaba hardcodeado (`SPACING_M = 122.47`, "1 punto cada 1.5 ha" fijo, el
// único lote de la demo). Acá cada lote tiene su propio `haPorPunto`, así
// que el espaciado se recibe como parámetro, calculado con la misma fórmula
// que generó la grilla real (ver `generarGrillaDesdePerimetro` en
// geometria.ts: `Math.sqrt(haPorPunto * 10000)`).

import { areaPoligonoM2, puntoEnPoligono, type XY } from "./geometria";

// Los dos umbrales dejan afuera la primera categoría de cada mapa de
// densidad (ver RANGOS_BABOSA/RANGOS_BICHO en lib/geo/densidad.ts) — a
// pedido del usuario, el manchoneo se concentra solo en las estaciones que
// ya importan, sin que las celdas más bajas empujen el polígono.
export const UMBRAL_APLICACION_BABOSA = 4; // babosas/m² — arranque de la 2da categoría (deja afuera 0-3)
export const UMBRAL_APLICACION_BICHO = 60; // bichos bolita/m² — arranque de la 3ra categoría (deja afuera 0-59, la 1ra y 2da combinadas)
export const FRANJA_PROTECCION_M = 60;
// Si el manchón queda a menos de esto del borde real del lote, se estira
// hasta tocarlo — a pedido del usuario: una tira más angosta que esto entre
// el manchón y el límite del lote es impráctica para aplicar cebo, mejor
// sumarla directamente. Ver el "cierre de huecos" en calcularZonaAplicacion.
export const DISTANCIA_CIERRE_BORDE_M = 40;
const RASTER_RES_M = 12; // resolución de la grilla de cálculo, en metros
// Qué tan cerca del borde real tiene que estar un vértice del contorno
// calculado para "pegarlo" a ese borde en vez de dejar la escalera del
// rasterizado — ver snapABorde. Un poco más que un lado de celda, para
// atrapar los pocos escalones que puede haber justo contra el límite.
const TOLERANCIA_SNAP_BORDE_M = RASTER_RES_M * 1.5;

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

function proyectarEnSegmento(p: XY, a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo2 = dx * dx + dy * dy;
  if (largo2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Distancia de un punto al lado más cercano de un perímetro (no a sus
 * vértices nomás — a cualquier punto sobre cualquiera de sus lados), más la
 * proyección exacta sobre ese lado. Hace falta para "cerrar huecos" contra
 * el borde y para "pegar" el contorno calculado al borde real (ver
 * DISTANCIA_CIERRE_BORDE_M/snapABorde) — con solo la distancia a los
 * vértices no alcanza, el punto más cercano casi siempre cae en el medio
 * de un lado, no justo en una esquina. */
function distanciaAPerimetro(p: XY, perimetro: XY[]): { dist: number; proyeccion: XY } {
  let mejorDist = Infinity;
  let mejorProy = p;
  for (let i = 0; i < perimetro.length; i++) {
    const a = perimetro[i];
    const b = perimetro[(i + 1) % perimetro.length];
    const proy = proyectarEnSegmento(p, a, b);
    const d = Math.hypot(p.x - proy.x, p.y - proy.y);
    if (d < mejorDist) {
      mejorDist = d;
      mejorProy = proy;
    }
  }
  return { dist: mejorDist, proyeccion: mejorProy };
}

/** "Pega" al borde real del lote los vértices del contorno calculado que
 * ya están pegados contra él (a menos de `tolerancia`) — sin esto, esos
 * tramos quedan como una escalera (aproximación del rasterizado a una
 * línea que en general no es horizontal ni vertical respecto de la grilla
 * de cálculo) en vez de la línea recta real del borde del lote. Después de
 * proyectar, se vuelve a sacar los vértices que quedaron colineales o
 * duplicados (mismo criterio que al final de trazarContornoEscalera) — el
 * snap normalmente colapsa varios escalones en un solo segmento recto. */
function snapABorde(loop: XY[], perimetro: XY[], tolerancia: number): XY[] {
  const snapeado = loop.map((v) => {
    const { dist, proyeccion } = distanciaAPerimetro(v, perimetro);
    return dist <= tolerancia ? proyeccion : v;
  });
  const n = snapeado.length;
  return snapeado.filter((b, i) => {
    const a = snapeado[(i - 1 + n) % n];
    const c = snapeado[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return false; // duplicado que dejó el snap
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    return Math.abs(cross) > 1e-6;
  });
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

  // Cerrar huecos angostos contra el borde del lote — a pedido del usuario:
  // si el manchón queda a menos de DISTANCIA_CIERRE_BORDE_M del borde real,
  // se estira hasta tocarlo, para no dejar tiras muy angostas entre el
  // manchón y el límite (imprácticas para aplicar cebo a mano).
  //
  // OJO acá: tiene que ser una extensión LOCAL, medida contra el manchón
  // ORIGINAL (antes de cerrar nada) — no "pegada a la celda ya incluida
  // más cercana", que en la primera versión de esto se armaba en cadena:
  // apenas el manchón tocaba el borde en un punto, la franja de <40m
  // contra el borde entero quedaba conectada consigo misma célula por
  // célula y terminaba envolviendo TODO el perímetro del lote, no solo el
  // sector cercano al manchón real. Con la distancia directa al manchón
  // original (Chebyshev, mismo criterio que ya usa el cálculo de arriba)
  // en vez de la cadena, la extensión queda acotada a lo que de verdad
  // está cerca — un lado que roza el borde se estira hasta ahí, un lado
  // lejano no se contagia por rodeo.
  const incluidaOriginal = [...incluidaGrid].map((key) => {
    const [ci, ri] = key.split(",").map(Number);
    return { u: minU + ci * RASTER_RES_M + RASTER_RES_M / 2, v: minV + ri * RASTER_RES_M + RASTER_RES_M / 2 };
  });
  for (let ci = 0; ci < nCols; ci++) {
    for (let ri = 0; ri < nRows; ri++) {
      const key = `${ci},${ri}`;
      if (incluidaGrid.has(key)) continue;
      const cu = minU + ci * RASTER_RES_M + RASTER_RES_M / 2;
      const cv = minV + ri * RASTER_RES_M + RASTER_RES_M / 2;
      if (!puntoEnPoligono(cu, cv, perimetroR)) continue;
      if (distanciaAPerimetro({ x: cu, y: cv }, perimetroR).dist >= DISTANCIA_CIERRE_BORDE_M) continue;
      const cercaDelManchonOriginal = incluidaOriginal.some(
        (o) => Math.max(Math.abs(cu - o.u), Math.abs(cv - o.v)) <= DISTANCIA_CIERRE_BORDE_M
      );
      if (cercaDelManchonOriginal) {
        incluidaGrid.add(key);
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
      // Pega al borde real del lote los tramos que ya quedaron pegados
      // contra él (ver snapABorde) — antes de rotar de vuelta, en el mismo
      // marco rotado que perimetroR.
      const snapeado = snapABorde(enUV, perimetroR, TOLERANCIA_SNAP_BORDE_M);
      const enXY = snapeado.map((v) => rotarPunto(v.x, v.y, theta));
      manchones.push(enXY);
    }
  }

  const haIncluidas = (celdasIncluidas * RASTER_RES_M * RASTER_RES_M) / 10000;
  return { manchones, haIncluidas, seleccionadas };
}

export interface ZonaCombinadaResultado {
  /** Zona A sin superposición con B (ej. bicho bolita solo). */
  soloA: XY[][];
  /** Zona B sin superposición con A (ej. babosas sola). */
  soloB: XY[][];
  /** Superposición real entre A y B — el "Dúo": donde conviven las dos
   * plagas y hace falta el producto combinado. */
  duo: XY[][];
  haSoloA: number;
  haSoloB: number;
  haDuo: number;
}

/** Combina dos manchones YA calculados (de cualquier origen — automático o
 * editado a mano, ver `manchonesA`/`manchonesB`) en tres zonas mutuamente
 * excluyentes: solo A, solo B, y la intersección ("Dúo" en la app, ver
 * salidas-view.tsx — el producto combinado que se usa cuando bicho bolita y
 * babosas conviven en el mismo sector).
 *
 * En vez de intersección/diferencia de polígonos "de verdad" (algo tipo
 * Weiler–Atherton — bastante más difícil de hacer bien con polígonos
 * cóncavos, varios manchones sueltos, y encima polígonos editados a mano
 * con formas arbitrarias), se rasteriza cada manchón contra la MISMA
 * grilla que usa `calcularZonaAplicacion` (mismo `RASTER_RES_M`, mismo
 * criterio de orientación) y las operaciones de conjunto se hacen sobre las
 * celdas — el mismo truco que ya usa el cálculo automático para el
 * flood-fill, aplicado acá a cualquier polígono de entrada sin importar su
 * origen (por eso funciona igual si `manchonesA`/`manchonesB` vienen del
 * cálculo automático o de una edición a mano). */
export function combinarZonas(
  manchonesA: XY[][],
  manchonesB: XY[][],
  perimetro: XY[],
  estacionesParaAngulo: EstacionAplicacion[],
  spacingM: number
): ZonaCombinadaResultado {
  const vacio: ZonaCombinadaResultado = { soloA: [], soloB: [], duo: [], haSoloA: 0, haSoloB: 0, haDuo: 0 };
  if ((manchonesA.length === 0 && manchonesB.length === 0) || perimetro.length < 3) return vacio;

  const theta = anguloGrilla(estacionesParaAngulo);
  const perimetroR = perimetro.map((v) => rotarPunto(v.x, v.y, -theta));
  const us = perimetroR.map((v) => v.x);
  const vs = perimetroR.map((v) => v.y);
  const minU = Math.min(...us) - FRANJA_PROTECCION_M;
  const maxU = Math.max(...us) + FRANJA_PROTECCION_M;
  const minV = Math.min(...vs) - FRANJA_PROTECCION_M;
  const maxV = Math.max(...vs) + FRANJA_PROTECCION_M;
  const nCols = Math.ceil((maxU - minU) / RASTER_RES_M);
  const nRows = Math.ceil((maxV - minV) / RASTER_RES_M);

  const celdasSoloA = new Set<string>();
  const celdasSoloB = new Set<string>();
  const celdasDuo = new Set<string>();
  let nSoloA = 0;
  let nSoloB = 0;
  let nDuo = 0;

  for (let ci = 0; ci < nCols; ci++) {
    for (let ri = 0; ri < nRows; ri++) {
      const cu = minU + ci * RASTER_RES_M + RASTER_RES_M / 2;
      const cv = minV + ri * RASTER_RES_M + RASTER_RES_M / 2;
      if (!puntoEnPoligono(cu, cv, perimetroR)) continue;
      // Vuelve al plano x,y real para probar contra los manchones (que
      // están en x,y sin rotar) — más simple que rotar cada manchón de
      // entrada, que puede venir editado a mano con cualquier forma.
      const { x: cx, y: cy } = rotarPunto(cu, cv, theta);
      const enA = manchonesA.some((m) => puntoEnPoligono(cx, cy, m));
      const enB = manchonesB.some((m) => puntoEnPoligono(cx, cy, m));
      const key = `${ci},${ri}`;
      if (enA && enB) {
        celdasDuo.add(key);
        nDuo++;
      } else if (enA) {
        celdasSoloA.add(key);
        nSoloA++;
      } else if (enB) {
        celdasSoloB.add(key);
        nSoloB++;
      }
    }
  }

  // Mismo snap al borde real que calcularZonaAplicacion (ver snapABorde) —
  // acá también se re-rasteriza y re-traza, así que le sale el mismo
  // serrucho contra el límite del lote si no se pega.
  const aReal = (celdas: Set<string>): XY[][] =>
    trazarContornoEscalera(celdas, RASTER_RES_M).map((loopUV) => {
      const enUV = loopUV.map((v) => ({ x: minU + v.x, y: minV + v.y }));
      const snapeado = snapABorde(enUV, perimetroR, TOLERANCIA_SNAP_BORDE_M);
      return snapeado.map((v) => rotarPunto(v.x, v.y, theta));
    });

  const celdaAHa = (RASTER_RES_M * RASTER_RES_M) / 10000;
  return {
    soloA: aReal(celdasSoloA),
    soloB: aReal(celdasSoloB),
    duo: aReal(celdasDuo),
    haSoloA: nSoloA * celdaAHa,
    haSoloB: nSoloB * celdaAHa,
    haDuo: nDuo * celdaAHa,
  };
}

/** Hectáreas reales de un set de manchones — a diferencia de `haIncluidas`
 * (una estimación por conteo de celdas de `RASTER_RES_M`, calculada una
 * sola vez junto con el polígono automático), esto mide el polígono en sí
 * con la fórmula exacta del shoelace. Se usa solo cuando la persona edita
 * los vértices a mano (ver MapaManchoneo/salidas-view.tsx): mientras nadie
 * toca el manchón, se sigue mostrando `haIncluidas` tal cual vino del
 * cálculo automático, sin recalcular nada de más. */
export function areaManchonesHa(manchones: XY[][]): number {
  return manchones.reduce((total, m) => total + areaPoligonoM2(m), 0) / 10000;
}

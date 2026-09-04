// Geometría para generar la grilla de muestreo a partir del perímetro real
// del KMZ. El prototipo nunca llegó a implementar esto de verdad (los datos
// del lote de ejemplo estaban procesados a mano, ver reference/CONTEXTO.md
// punto "Procesamiento del KMZ") — portamos sí la conversión metros↔lat/lon
// que usaba `activarGPS`/`xyALatLon`, y el test de punto-en-polígono que
// usaba el mapa de densidad, pero el armado de la grilla en sí es nuevo.

export interface LatLon {
  lat: number;
  lon: number;
}
export interface XY {
  x: number;
  y: number;
}

const METROS_POR_GRADO_LAT = 111320;

function metrosPorGradoLon(latOrigen: number): number {
  return METROS_POR_GRADO_LAT * Math.cos((latOrigen * Math.PI) / 180);
}

/** Mismo criterio de signos que `activarGPS` del prototipo: x crece al este,
 * y crece hacia el sur (para que calce con cómo se dibuja el mapa). */
export function latLonAXY(origen: LatLon, p: LatLon): XY {
  return {
    x: (p.lon - origen.lon) * metrosPorGradoLon(origen.lat),
    y: (origen.lat - p.lat) * METROS_POR_GRADO_LAT,
  };
}

/** Recupera el origen local (centro) que se usó al generar la grilla de un
 * lote, SIN necesidad de haberlo guardado en ningún lado: cada punto ya
 * tiene su x,y (relativo a ese origen) y su lat/lon real, así que se puede
 * despejar `origen` directo de la fórmula de `latLonAXY` — x = (lon-o.lon)*mpg,
 * y = (o.lat-lat)*mpgLat → o.lat = lat + y/mpgLat, o.lon = lon - x/mpgLon.
 * Hace falta esto para que la posición del GPS en vivo (que solo trae
 * lat/lon) caiga en el mismo plano x,y que ya tienen guardados los puntos
 * y el perímetro del lote. Con un solo punto ya lo recupera exacto; con
 * varios, promedia el ruido de redondeo. */
export function inferirOrigenDesdePuntos(puntos: Array<{ lat: number; lon: number; x: number; y: number }>): LatLon {
  if (puntos.length === 0) throw new Error("No hay puntos para inferir el origen del lote.");
  const lats = puntos.map((p) => p.lat + p.y / METROS_POR_GRADO_LAT);
  const latOrigen = lats.reduce((s, v) => s + v, 0) / lats.length;
  const mpgLonOrigen = metrosPorGradoLon(latOrigen);
  const lons = puntos.map((p) => p.lon - p.x / mpgLonOrigen);
  const lonOrigen = lons.reduce((s, v) => s + v, 0) / lons.length;
  return { lat: latOrigen, lon: lonOrigen };
}

export function xyALatLon(origen: LatLon, p: XY): LatLon {
  return {
    lat: origen.lat - p.y / METROS_POR_GRADO_LAT,
    lon: origen.lon + p.x / metrosPorGradoLon(origen.lat),
  };
}

/** Portado de `puntoEnPoligono` del prototipo (ray casting). */
export function puntoEnPoligono(x: number, y: number, poly: XY[]): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    if (yi > y !== yj > y) {
      const xin = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      if (x < xin) dentro = !dentro;
    }
  }
  return dentro;
}

/** Igual que `puntoEnPoligono`, pero para un lote de varias piezas no
 * contiguas (ver `generarGrillaDesdePerimetro`): adentro si cae dentro de
 * CUALQUIERA de las piezas — un lote de este tipo no es un solo contorno,
 * es la unión de sus piezas. */
export function puntoEnAlgunPoligono(x: number, y: number, piezas: XY[][]): boolean {
  return piezas.some((pieza) => puntoEnPoligono(x, y, pieza));
}

/** Centro (promedio simple de vértices) de la pieza más cercana a `p` — se
 * usa como respaldo cuando un punto no cae justo adentro de ninguna pieza
 * por un error de redondeo de punto flotante (ver `calcularCeldasDensidad`
 * en densidad.ts): en vez de descartarlo, se lo asigna a la pieza más
 * próxima. */
export function indicePiezaMasCercana(p: XY, piezas: XY[][]): number {
  let mejor = 0;
  let mejorDist = Infinity;
  piezas.forEach((pieza, i) => {
    const cx = pieza.reduce((s, v) => s + v.x, 0) / pieza.length;
    const cy = pieza.reduce((s, v) => s + v.y, 0) / pieza.length;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    if (dist < mejorDist) {
      mejorDist = dist;
      mejor = i;
    }
  });
  return mejor;
}

/** Casco convexo (Andrew monotone chain) — portado tal cual del prototipo.
 * Vive acá (y no en densidad.ts, que también lo usa) porque
 * `generarGrillaDesdePerimetro` también lo necesita, para el ángulo
 * compartido de la grilla — ver más abajo. */
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

function cruzVectorial(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function puntoEnTriangulo(p: XY, a: XY, b: XY, c: XY): boolean {
  const d1 = cruzVectorial(a, b, p);
  const d2 = cruzVectorial(b, c, p);
  const d3 = cruzVectorial(c, a, p);
  const tieneNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const tienePos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(tieneNeg && tienePos);
}

/** Triangula un polígono simple (sin agujeros, puede ser cóncavo) por el
 * método de "oreja" (ear clipping) — cada triángulo resultante es
 * convexo. Se usa para recortar el mapa de densidad contra el contorno
 * REAL de una pieza (ver `calcularCeldasDensidad` en densidad.ts) en vez
 * de contra su casco convexo: Sutherland-Hodgman (el recorte que ya usa
 * esa función) solo da un resultado correcto contra un recorte convexo,
 * así que una pieza cóncava (p.ej. con un entrante dejado a propósito
 * para excluir un pivote de riego) hay que partirla en triángulos
 * primero — cada uno se recorta por separado y despierta bien el hueco,
 * en vez de que el casco convexo lo "puentee" con una línea recta y
 * termine coloreando encima de una zona que no es parte del lote. */
export function triangularPoligono(polyEntrada: XY[]): XY[][] {
  if (polyEntrada.length < 3) return [];
  if (polyEntrada.length === 3) return [polyEntrada];

  // Ear clipping necesita orden antihorario (área con signo positivo).
  let poly = areaConSigno(polyEntrada) < 0 ? [...polyEntrada].reverse() : [...polyEntrada];
  const triangulos: XY[][] = [];
  let guardia = poly.length * poly.length; // corta cualquier caso raro (polígono mal formado) en vez de colgarse

  while (poly.length > 3 && guardia-- > 0) {
    let recortada = false;
    for (let i = 0; i < poly.length; i++) {
      const iPrev = (i - 1 + poly.length) % poly.length;
      const iNext = (i + 1) % poly.length;
      const prev = poly[iPrev];
      const cur = poly[i];
      const next = poly[iNext];
      if (cruzVectorial(prev, cur, next) <= 0) continue; // reflejo (cóncavo acá) — no es una "oreja"

      const otros = poly.filter((_, j) => j !== iPrev && j !== i && j !== iNext);
      if (otros.some((p) => puntoEnTriangulo(p, prev, cur, next))) continue; // otro vértice cae adentro — no vale

      triangulos.push([prev, cur, next]);
      poly = poly.filter((_, j) => j !== i);
      recortada = true;
      break;
    }
    if (!recortada) break; // polígono degenerado/autointersectado — nos quedamos con lo ya triangulado
  }
  if (poly.length === 3) triangulos.push(poly);
  return triangulos;
}

function areaConSigno(poly: XY[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Rota un punto `theta` radianes alrededor del origen — exportada porque
 * también la usa `densidad.ts` para alinear las celdas del mapa de
 * densidad con el mismo ángulo con el que se sembró la grilla (ver
 * `calcularCeldasDensidad`), no con el norte. */
export function rotar(p: XY, theta: number): XY {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Área de un polígono (fórmula del shoelace) — exportada porque también la
 * usa `zona-aplicacion.ts` para recalcular el área real de un manchón
 * editado a mano (en vez de la estimación por celdas del cálculo
 * automático, ver `calcularZonaAplicacion`). */
export function areaPoligonoM2(poly: XY[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** Ángulo del borde más largo del polígono — alineamos la grilla a ese eje
 * para que las líneas de muestreo sigan el lado más largo del lote en vez
 * de ir siempre norte-sur, sin importar cómo esté "parado" el polígono.
 * Exportada porque `densidad.ts` la vuelve a calcular (mismo casco
 * convexo, mismo ángulo) para alinear las celdas del mapa de densidad
 * con las líneas reales de la grilla. */
export function anguloBordeMasLargo(poly: XY[]): number {
  let mejorLongitud = -1;
  let mejorAngulo = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const longitud = Math.hypot(dx, dy);
    if (longitud > mejorLongitud) {
      mejorLongitud = longitud;
      mejorAngulo = Math.atan2(dy, dx);
    }
  }
  return mejorAngulo;
}

/** Reparte puntos en el segmento [desde, hasta] con el espaciado real
 * pedido (sin estirarlo ni comprimirlo) — el primer punto queda exacto a
 * espaciado/2 del borde de entrada; el último cae donde caiga, más cerca o
 * más lejos del otro borde según cuánto sobre. Se prioriza mantener la
 * densidad de puntos/hectárea real por sobre que la fila cierre pareja. */
function espaciarDesdeInicio(desde: number, hasta: number, espaciado: number): number[] {
  const resultado: number[] = [];
  for (let v = desde + espaciado / 2; v <= hasta; v += espaciado) resultado.push(v);
  return resultado;
}

/** Dónde entra y sale el perímetro (ya rotado) de la horizontal y=v — un
 * escaneo tipo scanline: cada par de cruces consecutivos es un tramo
 * "adentro" del lote. Para un lote convexo da un solo tramo; para uno
 * cóncavo (forma de L, con una entrada, etc.) puede dar varios. */
function tramosDeFila(v: number, poly: XY[]): Array<[number, number]> {
  const cruces: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    if (yi > v !== yj > v) {
      const xi = poly[i].x;
      const xj = poly[j].x;
      cruces.push(xi + ((v - yi) / (yj - yi)) * (xj - xi));
    }
  }
  cruces.sort((a, b) => a - b);
  const tramos: Array<[number, number]> = [];
  for (let i = 0; i + 1 < cruces.length; i += 2) tramos.push([cruces[i], cruces[i + 1]]);
  return tramos;
}

export interface PuntoGrillaGenerado {
  linea: number;
  puntoNum: number;
  lat: number;
  lon: number;
  x: number;
  y: number;
}

export interface GrillaGenerada {
  puntos: PuntoGrillaGenerado[];
  /** Una o más piezas de terreno — casi siempre una sola; más de una si el
   * campo está compuesto por lotes no contiguos (ver
   * `generarGrillaDesdePerimetro`). */
  piezas: XY[][];
  hectareas: number;
  /** El ángulo con el que se armó ESTA grilla (en grados, 0-360) — el
   * automático si no se pasó `anguloManualGrados`, o ese mismo valor si sí
   * se pasó. Sirve para la vista previa "Orientación de la grilla" (ver
   * features/lotes/orientacion-grilla.tsx): al abrirla por primera vez,
   * sin haber tocado nada todavía, necesita saber cuál es el automático
   * para arrancar el control ahí (y para "Restablecer original" después
   * de haberlo movido). */
  anguloGrados: number;
}

/** Prepara UNA pieza del perímetro para trabajar en metros: saca el vértice
 * de cierre repetido (si lo hay) y valida que tenga al menos 3 vértices
 * reales. */
function limpiarPieza(piezaEntrada: LatLon[]): LatLon[] {
  const pieza = [...piezaEntrada];
  const primero = pieza[0];
  const ultimo = pieza[pieza.length - 1];
  if (pieza.length > 1 && Math.abs(primero.lat - ultimo.lat) < 1e-9 && Math.abs(primero.lon - ultimo.lon) < 1e-9) {
    pieza.pop(); // el KML suele cerrar el anillo repitiendo el primer vértice al final
  }
  return pieza;
}

/** Genera la grilla de muestreo real a partir del perímetro del KMZ, que
 * puede venir en una o más "piezas" — un campo compuesto por varios lotes
 * NO contiguos (sin borde compartido, cada uno un `<Polygon>` separado
 * dentro de un `<MultiGeometry>`, ver parsear-kmz.ts). A pedido del usuario
 * (ver el GPX de referencia que mandó, de Global Mapper) se arma UNA sola
 * grilla que cubre TODO el área combinada, como si las piezas fueran un
 * mismo campo grande con huecos vacíos en el medio:
 * 1. Un único origen local (centro = promedio de TODOS los vértices de
 *    TODAS las piezas) y un único ángulo de rotación (el borde más largo
 *    del casco convexo de TODOS los vértices juntos, no el de cada pieza
 *    por separado) — una sola orientación para toda la grilla.
 * 2. Se barre fila por fila TODO el rectángulo que envuelve a las piezas
 *    juntas (mismo `tramosDeFila` de siempre, pero calculado pieza por
 *    pieza y después juntando los tramos de esa fila ordenados de
 *    izquierda a derecha). Así, una fila puede atravesar varias piezas
 *    separadas por un hueco — el hueco entre piezas queda automáticamente
 *    sin puntos, no hace falta "eliminarlos" en un paso aparte.
 * 3. La numeración queda única en toda la grilla sin necesitar nada más:
 *    la línea es una sola secuencia para todo el campo (no se reinicia por
 *    pieza) y el número de punto sigue corrido de un tramo al siguiente
 *    DENTRO de la misma fila, cruzando de una pieza a otra sin cortarse
 *    (p.ej. línea 1 puede ir del 1.1 al 1.10, con 1.1-1.3 en una pieza,
 *    1.4-1.6 en otra y 1.7-1.10 en una tercera, si esa fila las atraviesa
 *    a las tres).
 * 4. Hectáreas = suma de las de cada pieza (shoelace, una por una). */
export function generarGrillaDesdePerimetro(
  piezasEntrada: LatLon[][],
  haPorPunto: number,
  /** En grados (0-360), no radianes — pensado para venir directo de un
   * control de UI (slider/input numérico, ver orientacion-grilla.tsx).
   * Sin esto, el ángulo se sigue calculando automático como siempre. */
  anguloManualGrados?: number
): GrillaGenerada {
  const piezasLimpias = piezasEntrada.map(limpiarPieza).filter((p) => p.length >= 3);
  if (piezasLimpias.length === 0) {
    throw new Error("El KMZ no contiene ningún polígono válido (hacen falta al menos 3 vértices por pieza).");
  }

  const todosLosVertices = piezasLimpias.flat();
  const origen: LatLon = {
    lat: todosLosVertices.reduce((s, p) => s + p.lat, 0) / todosLosVertices.length,
    lon: todosLosVertices.reduce((s, p) => s + p.lon, 0) / todosLosVertices.length,
  };

  const espaciado = Math.sqrt(haPorPunto * 10000);
  const piezas: XY[][] = piezasLimpias.map((pieza) => pieza.map((p) => latLonAXY(origen, p)));
  const hectareas = piezas.reduce((s, pz) => s + areaPoligonoM2(pz) / 10000, 0);

  // Ángulo compartido por TODA la grilla — el lado más largo del casco
  // convexo de todos los vértices juntos (ver el comentario de arriba), o
  // el que se haya elegido a mano en "Orientación de la grilla".
  const angulo =
    anguloManualGrados !== undefined ? (anguloManualGrados * Math.PI) / 180 : anguloBordeMasLargo(cascoConvexo(piezas.flat()));
  const piezasRotadas = piezas.map((pz) => pz.map((p) => rotar(p, -angulo)));
  const vs = piezasRotadas.flat().map((p) => p.y);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);

  // Columnas (posiciones en u) COMPARTIDAS por toda la grilla, calculadas
  // una sola vez sobre el ancho total — a propósito, en vez de que cada
  // fila arranque su propio espaciado desde su propio borde izquierdo
  // (`tramos[0]`). Con un lote que no es un rectángulo perfecto (casi
  // ningún lote real lo es) ese borde se corre un poco de una fila a la
  // siguiente, así que las columnas quedaban desalineadas entre filas —
  // el resultado seguía siendo una grilla con el espaciado real pedido,
  // pero las celdas de Voronoi de vista general/densidad salían
  // hexagonales en vez de cuadradas por TODA la grilla (no solo cerca de
  // un borde irregular), porque los puntos de filas vecinas no quedaban
  // uno debajo del otro. Generando las columnas una vez y filtrando cuáles
  // caen adentro de cada tramo, todas las filas comparten la misma malla.
  const us = piezasRotadas.flat().map((p) => p.x);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const columnas = espaciarDesdeInicio(minU, maxU, espaciado);

  const puntos: PuntoGrillaGenerado[] = [];
  let linea = 0;
  for (const v of espaciarDesdeInicio(minV, maxV, espaciado)) {
    // Tramos de CADA pieza en esta fila, juntados de izquierda a derecha —
    // una fila puede así cruzar varias piezas separadas por un hueco vacío
    // en el medio (ver el comentario de arriba). Puede haber más de un
    // tramo por pieza si es cóncava (forma de "L", con una entrada, etc.).
    const tramos = piezasRotadas
      .flatMap((pz) => tramosDeFila(v, pz))
      .sort((a, b) => a[0] - b[0]);
    if (tramos.length === 0) continue;
    linea += 1;
    let puntoNum = 0;
    for (const [inicio, fin] of tramos) {
      for (const u of columnas.filter((u) => u >= inicio && u <= fin)) {
        puntoNum += 1; // sigue corrido de un tramo (pieza) al siguiente, no se reinicia
        const p = rotar({ x: u, y: v }, angulo); // vuelve al plano x,y original (sin rotar)
        const { lat, lon } = xyALatLon(origen, p);
        puntos.push({ linea, puntoNum, lat, lon, x: p.x, y: p.y });
      }
    }
  }

  if (puntos.length === 0) {
    throw new Error("No se generó ningún punto de muestreo — probá con menos hectáreas por punto.");
  }

  const anguloGrados = ((angulo * 180) / Math.PI + 360) % 360; // normalizado a 0-360
  return { puntos, piezas, hectareas, anguloGrados };
}

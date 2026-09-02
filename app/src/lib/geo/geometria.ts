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

function rotar(p: XY, theta: number): XY {
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
 * de ir siempre norte-sur, sin importar cómo esté "parado" el polígono. */
function anguloBordeMasLargo(poly: XY[]): number {
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
 * dentro de un `<MultiGeometry>`, ver parsear-kmz.ts). Cada pieza se siembra
 * de forma completamente independiente, como si fuera su propio lote chico:
 * 1. Un único origen local (centro = promedio de TODOS los vértices de
 *    TODAS las piezas) para que las piezas queden en el mismo plano x,y,
 *    comparable entre sí (mapa, densidad, etc.) — no cambia ningún lat/lon
 *    real, es solo el punto de referencia de la conversión a metros.
 * 2. Por cada pieza: rota para alinear SU PROPIO borde más largo con el eje
 *    horizontal (cada pieza puede estar "parada" en un ángulo distinto —
 *    no tendría sentido forzarlas todas al mismo ángulo), arma sus líneas
 *    de muestreo con el mismo criterio de siempre (`tramosDeFila`, para
 *    que una pieza cóncava tipo "L" también funcione bien), y NUNCA deja
 *    que una línea salga de esa pieza hacia otra: una persona no puede
 *    caminar una línea que salte entre dos lotes separados en el campo.
 * 3. La numeración de línea sigue corrida entre piezas (pieza 1: líneas
 *    1..n, pieza 2: líneas n+1..m, …) — mismo criterio simple que ya usaba
 *    esto para una sola pieza, ahora sin cortar a cero entre una pieza y la
 *    siguiente.
 * 4. Hectáreas = suma de las de cada pieza (shoelace, una por una). */
export function generarGrillaDesdePerimetro(piezasEntrada: LatLon[][], haPorPunto: number): GrillaGenerada {
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
  const piezas: XY[][] = [];
  const puntos: PuntoGrillaGenerado[] = [];
  let hectareas = 0;
  let linea = 0;

  for (const pieza of piezasLimpias) {
    const piezaXY = pieza.map((p) => latLonAXY(origen, p));
    piezas.push(piezaXY);
    hectareas += areaPoligonoM2(piezaXY) / 10000;

    const angulo = anguloBordeMasLargo(piezaXY);
    const rotado = piezaXY.map((p) => rotar(p, -angulo));
    const vs = rotado.map((p) => p.y);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs);

    // La primera línea de CADA pieza (paralela al lado más largo de esa
    // pieza) queda exacta a espaciado/2 del borde real de entrada. Las
    // siguientes van sumando el espaciado pedido tal cual, sin ajustarlo —
    // así la cantidad de puntos sigue de cerca a hectareas/haPorPunto (la
    // última línea puede quedar más cerca o más lejos del borde opuesto,
    // la forma de la pieza manda).
    for (const v of espaciarDesdeInicio(minV, maxV, espaciado)) {
      // Dónde entra y sale el perímetro real de ESTA pieza en esta fila
      // (puede haber más de un tramo si la pieza tiene una forma cóncava,
      // tipo "L" o con una entrada) — reparte los puntos dentro de cada
      // tramo, no de la caja que envuelve a la pieza.
      const tramos = tramosDeFila(v, rotado);
      const filaXY: XY[] = [];
      for (const [inicio, fin] of tramos) {
        for (const u of espaciarDesdeInicio(inicio, fin, espaciado)) {
          filaXY.push(rotar({ x: u, y: v }, angulo)); // vuelve al plano x,y original (sin rotar)
        }
      }
      if (filaXY.length === 0) continue;
      linea += 1;
      filaXY.forEach((p, i) => {
        const { lat, lon } = xyALatLon(origen, p);
        puntos.push({ linea, puntoNum: i + 1, lat, lon, x: p.x, y: p.y });
      });
    }
  }

  if (puntos.length === 0) {
    throw new Error("No se generó ningún punto de muestreo — probá con menos hectáreas por punto.");
  }

  return { puntos, piezas, hectareas };
}

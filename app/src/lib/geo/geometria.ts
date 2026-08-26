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

function rotar(p: XY, theta: number): XY {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function areaM2(poly: XY[]): number {
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
  perimetroXY: XY[];
  hectareas: number;
}

/** Genera la grilla de muestreo real a partir del perímetro del KMZ:
 * 1. Centro = promedio de los vértices, se usa como origen local (no hace
 *    falta guardarlo: cada punto ya sale con su lat/lon real).
 * 2. Rota el polígono para alinear su borde más largo con el eje horizontal
 *    — cada "línea" de puntos queda paralela a ese lado.
 * 3. Por cada línea calcula dónde entra y sale el perímetro real (no la
 *    caja que lo envuelve) y reparte los puntos espaciados
 *    `sqrt(haPorPunto * 10000)` metros (misma fórmula que
 *    `generarGrillaSintetica` del prototipo), arrancando cada línea y cada
 *    tramo exacto a espaciado/2 del borde de entrada.
 * 4. Numera "línea.punto" por fila, en el orden en que se generaron. */
export function generarGrillaDesdePerimetro(perimetroEntrada: LatLon[], haPorPunto: number): GrillaGenerada {
  const perimetro = [...perimetroEntrada];
  const primero = perimetro[0];
  const ultimo = perimetro[perimetro.length - 1];
  if (perimetro.length > 1 && Math.abs(primero.lat - ultimo.lat) < 1e-9 && Math.abs(primero.lon - ultimo.lon) < 1e-9) {
    perimetro.pop(); // el KML suele cerrar el anillo repitiendo el primer vértice al final
  }
  if (perimetro.length < 3) {
    throw new Error("El KMZ no contiene un polígono válido (hacen falta al menos 3 vértices).");
  }

  const origen: LatLon = {
    lat: perimetro.reduce((s, p) => s + p.lat, 0) / perimetro.length,
    lon: perimetro.reduce((s, p) => s + p.lon, 0) / perimetro.length,
  };
  const perimetroXY = perimetro.map((p) => latLonAXY(origen, p));
  const hectareas = areaM2(perimetroXY) / 10000;

  const angulo = anguloBordeMasLargo(perimetroXY);
  const rotado = perimetroXY.map((p) => rotar(p, -angulo));
  const vs = rotado.map((p) => p.y);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);

  const espaciado = Math.sqrt(haPorPunto * 10000);
  const puntos: PuntoGrillaGenerado[] = [];
  let linea = 0;
  // La primera línea (paralela al lado más largo del lote) queda exacta a
  // espaciado/2 del borde real de entrada. Las siguientes van sumando el
  // espaciado pedido tal cual, sin ajustarlo — así la cantidad de puntos
  // sigue de cerca a hectareas/haPorPunto (la última línea puede quedar
  // más cerca o más lejos del borde opuesto, la forma del lote manda).
  for (const v of espaciarDesdeInicio(minV, maxV, espaciado)) {
    // Dónde entra y sale el perímetro real en esta fila (puede haber más de
    // un tramo si el lote tiene una forma cóncava, tipo "L" o con una
    // entrada) — reparte los puntos dentro de cada tramo, no de la caja
    // que envuelve a todo el lote.
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

  if (puntos.length === 0) {
    throw new Error("No se generó ningún punto de muestreo — probá con menos hectáreas por punto.");
  }

  return { puntos, perimetroXY, hectareas };
}

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
 * 2. Rota el polígono para alinear su borde más largo con el eje horizontal.
 * 3. Recorre esa grilla rotada espaciada `sqrt(haPorPunto * 10000)` metros
 *    (misma fórmula que `generarGrillaSintetica` del prototipo) y descarta
 *    los puntos que caen afuera del polígono real.
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
  const us = rotado.map((p) => p.x);
  const vs = rotado.map((p) => p.y);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);

  const espaciado = Math.sqrt(haPorPunto * 10000);
  const puntos: PuntoGrillaGenerado[] = [];
  let linea = 0;
  for (let v = minV + espaciado / 2; v <= maxV; v += espaciado) {
    const filaXY: XY[] = [];
    for (let u = minU + espaciado / 2; u <= maxU; u += espaciado) {
      const real = rotar({ x: u, y: v }, angulo); // vuelve al plano x,y original (sin rotar)
      if (puntoEnPoligono(real.x, real.y, perimetroXY)) filaXY.push(real);
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

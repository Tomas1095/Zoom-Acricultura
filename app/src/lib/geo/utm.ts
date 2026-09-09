// Proyección UTM (WGS84) — a pedido del usuario: el shapefile que exporta
// la app venía en WGS84 GEOGRÁFICO (grados, sin proyectar), y eso le rompía
// el Voronoi en ArcGIS (Geostatistical Analyst → Voronoi Map): calculado
// directo sobre grados, una grilla cuadrada en la realidad deja de ser
// matemáticamente un cuadrado ahí adentro (1° de longitud no mide lo mismo
// en metros que 1° de latitud, salvo justo en el ecuador), y con eso el
// programa terminaba armando hexágonos en vez de cuadrados. Confirmado con
// el usuario: reproyectando a mano a UTM en ArcGIS antes de correr Voronoi,
// el problema desaparece — esto hace ese mismo paso automático, exportando
// el shapefile ya en UTM (metros) en vez de en grados.
//
// La fórmula es la serie de Krüger de 3er orden (la misma que usan
// PROJ/GDAL y prácticamente cualquier herramienta GIS moderna por dentro) —
// exactitud sub-milimétrica a la distancia de la zona UTM completa (unos
// pocos cientos de km del meridiano central), muy por encima de lo que hace
// falta acá (un lote real mide, como mucho, unos pocos km). Validada contra
// el valor de referencia públicamente conocido para (lat 0, lon 0) en la
// zona UTM 31N: easting 166021.443 m, northing 0.000 m — coincide exacto.

const A_WGS84 = 6378137.0; // semieje mayor
const F_WGS84 = 1 / 298.257223563; // achatamiento
const K0 = 0.9996; // factor de escala UTM
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SUR = 10000000;

const N = F_WGS84 / (2 - F_WGS84);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;

const A_SERIE = (A_WGS84 / (1 + N)) * (1 + N2 / 4 + N4 / 64);
const ALPHA1 = N / 2 - (2 / 3) * N2 + (5 / 16) * N3;
const ALPHA2 = (13 / 48) * N2 - (3 / 5) * N3;
const ALPHA3 = (61 / 240) * N3;

function asinh(x: number): number {
  return Math.log(x + Math.sqrt(1 + x * x));
}
function atanh(x: number): number {
  return 0.5 * Math.log((1 + x) / (1 - x));
}

/** Zona UTM (1-60) que le corresponde a una longitud — cada zona cubre 6°,
 * arrancando en -180°. Un lote real (unos pocos km) nunca alcanza a cruzar
 * una zona entera (667km de ancho más o menos, a nuestras latitudes), así
 * que alcanza con calcularla UNA vez por lote (ver `origen`, en
 * shapefile.ts) y usarla para todos sus puntos/vértices. */
export function zonaUTM(lonDeg: number): number {
  return Math.min(60, Math.max(1, Math.floor((lonDeg + 180) / 6) + 1));
}

export interface PuntoUTM {
  este: number;
  norte: number;
}

/** Convierte lat/lon (WGS84, grados) a coordenadas UTM (metros) en la zona
 * indicada — a propósito NO recalcula la zona por punto (ver `zonaUTM`):
 * todos los puntos/vértices de un mismo lote tienen que quedar en la MISMA
 * zona para que el shapefile resultante sea coherente, aunque alguno caiga
 * técnicamente un pelo más cerca de la zona vecina. */
export function latLonAUTM(latDeg: number, lonDeg: number, zona: number, hemisferioSur: boolean): PuntoUTM {
  const lon0 = zona * 6 - 183; // meridiano central de la zona
  const phi = (latDeg * Math.PI) / 180;
  const lambda = ((lonDeg - lon0) * Math.PI) / 180;

  const t = asinh(Math.tan(phi)) - (2 * Math.sqrt(N)) / (1 + N) * atanh(((2 * Math.sqrt(N)) / (1 + N)) * Math.sin(phi));
  const xiP = Math.atan2(Math.sinh(t), Math.cos(lambda));
  const etaP = atanh(Math.sin(lambda) / Math.cosh(t));

  let xi = xiP;
  let eta = etaP;
  const alphas: [number, number][] = [
    [1, ALPHA1],
    [2, ALPHA2],
    [3, ALPHA3],
  ];
  for (const [j, alpha] of alphas) {
    xi += alpha * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += alpha * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }

  const este = K0 * A_SERIE * eta + FALSE_EASTING;
  let norte = K0 * A_SERIE * xi;
  if (hemisferioSur) norte += FALSE_NORTHING_SUR;
  return { este, norte };
}

/** WKT del .prj para una zona/hemisferio UTM en WGS84 — mismo formato que
 * espera cualquier GIS (QGIS/ArcGIS lo reconocen sin preguntar nada, igual
 * que el WGS84 geográfico que usaba el shapefile antes). */
export function prjUTM(zona: number, hemisferioSur: boolean): string {
  const centralMeridian = zona * 6 - 183;
  const falseNorthing = hemisferioSur ? FALSE_NORTHING_SUR : 0;
  const nombre = `WGS_1984_UTM_Zone_${zona}${hemisferioSur ? "S" : "N"}`;
  return (
    `PROJCS["${nombre}",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",` +
    `SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],` +
    `UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],` +
    `PARAMETER["False_Easting",${FALSE_EASTING}.0],` +
    `PARAMETER["False_Northing",${falseNorthing}.0],` +
    `PARAMETER["Central_Meridian",${centralMeridian}.0],` +
    `PARAMETER["Scale_Factor",${K0}],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`
  );
}

// Exportar la grilla de puntos como Shapefile (.shp/.shx/.dbf/.prj, el
// formato clásico de GIS — QGIS, ArcGIS, y la mayoría del software de
// agricultura de precisión lo leen directo) — a pedido del usuario, tercer
// formato junto a GPX y KML (ver puntos.ts). No hay ninguna librería que
// ESCRIBA shapefiles pensada para React Native (las que hay son para leer,
// o dependen del DOM del navegador — Blob/FileReader, que no existen acá),
// así que se arma el binario a mano: el formato en sí es viejo, simple y
// estable (no cambia hace décadas), documentado por Esri en
// https://www.esri.com/content/dam/esrisites/sitecore-archive/Files/Pdfs/library/whitepapers/pdfs/shapefile.pdf
//
// Un shapefile no es un solo archivo — son 3 obligatorios (.shp la
// geometría, .shx un índice de esa geometría, .dbf la tabla de atributos)
// más uno opcional (.prj, la proyección) que en la práctica todo el mundo
// espera igual. Random se entregan comprimidos en un .zip (mismo criterio
// que ya usa este proyecto para el KMZ, que es un KML zippeado) — así queda
// un solo archivo para compartir/guardar, y QGIS/ArcGIS abren un shapefile
// directo desde un .zip sin necesidad de descomprimirlo antes.

import JSZip from "jszip";
import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { guardarYCompartirBinario, sanitizarNombreArchivo } from "./archivo";
import type { PuntoGrillaExport } from "./puntos";

// Point (sin Z ni M) — shape type 1, ver el manual de Esri, "Point Record".
const SHAPE_TYPE_POINT = 1;
// Polygon — shape type 5, para el shapefile del perímetro del lote (ver
// construirShapefileLotePoligonoZip, más abajo).
const SHAPE_TYPE_POLYGON = 5;

/** Cabecera de 100 bytes común a .shp y .shx — la única diferencia entre
 * los dos es el largo total del archivo (`largoArchivoWords`) y qué va
 * después de la cabecera. `shapeType` tiene que coincidir con el que
 * llevan los registros de ESE archivo (Point o Polygon) — no es solo
 * informativo, algunos lectores estrictos (no todos son tan tolerantes
 * como QGIS) lo usan para decidir cómo interpretar el resto del archivo. */
function escribirCabecera(
  view: DataView,
  largoArchivoWords: number,
  shapeType: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): void {
  view.setInt32(0, 9994, false); // file code, big-endian
  for (let i = 4; i <= 20; i += 4) view.setInt32(i, 0, false); // 5 enteros sin usar
  view.setInt32(24, largoArchivoWords, false); // big-endian
  view.setInt32(28, 1000, true); // versión, little-endian
  view.setInt32(32, shapeType, true);
  view.setFloat64(36, minX, true);
  view.setFloat64(44, minY, true);
  view.setFloat64(52, maxX, true);
  view.setFloat64(60, maxY, true);
  // Zmin/Zmax/Mmin/Mmax (bytes 68-99): no se usan en este shape type, quedan en 0.
}

/** Arma el .shp (la geometría en sí) y el .shx (índice: dónde arranca y
 * cuánto mide cada registro del .shp) — van de la mano, por eso una sola
 * función arma los dos juntos. */
function construirShpYShx(puntosLatLon: LatLon[]): { shp: Uint8Array; shx: Uint8Array } {
  const n = puntosLatLon.length;
  const CONTENIDO_BYTES = 4 + 8 + 8; // shape type + X + Y
  const CONTENIDO_WORDS = CONTENIDO_BYTES / 2; // el formato mide todo en "palabras" de 16 bits
  const REGISTRO_SHP_BYTES = 8 + CONTENIDO_BYTES; // cabecera de registro (8) + contenido

  const lons = puntosLatLon.map((p) => p.lon);
  const lats = puntosLatLon.map((p) => p.lat);
  const minX = Math.min(...lons);
  const maxX = Math.max(...lons);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const shpBuffer = new ArrayBuffer(100 + n * REGISTRO_SHP_BYTES);
  const shpView = new DataView(shpBuffer);
  escribirCabecera(shpView, (100 + n * REGISTRO_SHP_BYTES) / 2, SHAPE_TYPE_POINT, minX, minY, maxX, maxY);

  const shxBuffer = new ArrayBuffer(100 + n * 8);
  const shxView = new DataView(shxBuffer);
  escribirCabecera(shxView, (100 + n * 8) / 2, SHAPE_TYPE_POINT, minX, minY, maxX, maxY);

  let offsetShp = 100;
  puntosLatLon.forEach((p, i) => {
    shpView.setInt32(offsetShp, i + 1, false); // número de registro, 1-based, big-endian
    shpView.setInt32(offsetShp + 4, CONTENIDO_WORDS, false);
    shpView.setInt32(offsetShp + 8, SHAPE_TYPE_POINT, true);
    shpView.setFloat64(offsetShp + 12, p.lon, true); // X = longitud
    shpView.setFloat64(offsetShp + 20, p.lat, true); // Y = latitud

    const offsetShx = 100 + i * 8;
    shxView.setInt32(offsetShx, offsetShp / 2, false); // offset del registro, en palabras
    shxView.setInt32(offsetShx + 4, CONTENIDO_WORDS, false);

    offsetShp += REGISTRO_SHP_BYTES;
  });

  return { shp: new Uint8Array(shpBuffer), shx: new Uint8Array(shxBuffer) };
}

interface CampoDbf {
  nombre: string; // hasta 10 caracteres, es el límite del formato
  tipo: "C" | "N"; // Character o Numeric — lo único que hace falta acá
  largo: number;
}

function escribirTextoAscii(view: DataView, offset: number, texto: string, largo: number): void {
  for (let i = 0; i < largo; i++) view.setUint8(offset + i, i < texto.length ? texto.charCodeAt(i) : 0);
}

/** Arma el .dbf — la tabla de atributos, una fila por punto en el mismo
 * orden que el .shp/.shx (así es como un shapefile conecta cada geometría
 * con sus datos: por posición, no por un id explícito). Portado del
 * formato dBASE III sin memo, que es el que espera cualquier lector de
 * shapefiles. */
function construirDbf(puntos: PuntoGrillaExport[]): Uint8Array {
  const campos: CampoDbf[] = [
    { nombre: "ID", tipo: "C", largo: 20 }, // "línea.punto", ej "1.4" — igual que en el GPX/KML
    { nombre: "LINEA", tipo: "N", largo: 6 },
    { nombre: "PUNTO", tipo: "N", largo: 6 },
  ];
  const largoRegistro = 1 + campos.reduce((s, c) => s + c.largo, 0); // +1 = bandera de borrado
  const largoCabecera = 32 + campos.length * 32 + 1; // +1 = terminador 0x0D
  const n = puntos.length;

  const buffer = new ArrayBuffer(largoCabecera + n * largoRegistro + 1); // +1 = marca de fin de archivo
  const view = new DataView(buffer);

  const hoy = new Date();
  view.setUint8(0, 0x03); // versión dBASE III, sin memo
  view.setUint8(1, hoy.getFullYear() - 1900);
  view.setUint8(2, hoy.getMonth() + 1);
  view.setUint8(3, hoy.getDate());
  view.setUint32(4, n, true); // cantidad de registros
  view.setUint16(8, largoCabecera, true);
  view.setUint16(10, largoRegistro, true);

  campos.forEach((campo, i) => {
    const base = 32 + i * 32;
    escribirTextoAscii(view, base, campo.nombre, 11);
    view.setUint8(base + 11, campo.tipo.charCodeAt(0));
    view.setUint8(base + 16, campo.largo);
    view.setUint8(base + 17, 0); // decimales — no hace falta acá, son todos enteros
  });
  view.setUint8(32 + campos.length * 32, 0x0d); // terminador de la sección de campos

  let offset = largoCabecera;
  for (const p of puntos) {
    const [linea, puntoNum] = p.id.split(".").map(Number);
    view.setUint8(offset, 0x20); // bandera de borrado: espacio = registro activo
    let col = offset + 1;
    escribirTextoAscii(view, col, p.id, 20); // texto: alineado a la izquierda
    col += 20;
    const lineaTxt = String(linea).padStart(6, " "); // números: alineados a la derecha
    escribirTextoAscii(view, col, lineaTxt, 6);
    col += 6;
    const puntoTxt = String(puntoNum).padStart(6, " ");
    escribirTextoAscii(view, col, puntoTxt, 6);
    offset += largoRegistro;
  }
  view.setUint8(offset, 0x1a); // fin de archivo

  return new Uint8Array(buffer);
}

// WGS84 geográfico — mismo datum que usan lat/lon en toda la app (ver
// geometria.ts). Es el .prj estándar que cualquier GIS reconoce sin
// preguntar nada.
const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

/** Arma el .zip con los 4 archivos del shapefile (.shp/.shx/.dbf/.prj),
 * listo para compartir como un solo archivo — ver el comentario del
 * encabezado de este módulo. */
export async function construirShapefilePuntosZip(
  puntos: PuntoGrillaExport[],
  origen: LatLon,
  nombreBase: string
): Promise<Uint8Array> {
  const puntosLatLon = puntos.map((p) => xyALatLon(origen, p));
  const { shp, shx } = construirShpYShx(puntosLatLon);
  const dbf = construirDbf(puntos);

  const zip = new JSZip();
  zip.file(`${nombreBase}.shp`, shp);
  zip.file(`${nombreBase}.shx`, shx);
  zip.file(`${nombreBase}.dbf`, dbf);
  zip.file(`${nombreBase}.prj`, PRJ_WGS84);
  return zip.generateAsync({ type: "uint8array" });
}

// ---------- Shapefile del polígono del lote ----------
// A pedido del usuario: al exportar la grilla en Shapefile, además del
// archivo de puntos de arriba, se genera automáticamente OTRO shapefile
// (.zip separado, para abrirlo aparte) con el/los polígono(s) del lote —
// así en QGIS/ArcGIS se puede cargar el límite real del lote junto con la
// grilla, sin tener que dibujarlo de nuevo a mano.

/** Área con signo de un anillo (fórmula del shoelace), calculada directo
 * sobre lon/lat — positiva significa sentido ANTIhorario (en el sistema
 * matemático de siempre, donde X crece a la derecha e Y hacia arriba, que
 * es exactamente cómo se comportan lon/lat). Sirve para saber en qué
 * sentido viene un anillo, sin importar en qué orden lo haya guardado el
 * KMZ original. */
function areaConSigno(anillo: LatLon[]): number {
  let area = 0;
  for (let i = 0; i < anillo.length; i++) {
    const a = anillo[i];
    const b = anillo[(i + 1) % anillo.length];
    area += a.lon * b.lat - b.lon * a.lat;
  }
  return area / 2;
}

/** El formato Shapefile espera los anillos exteriores en sentido HORARIO
 * (ver el whitepaper de Esri, "Polygon") — no todos los lectores son tan
 * tolerantes como QGIS con esto, así que se fuerza acá en vez de confiar
 * en el sentido que haya traído el KMZ original. */
function asegurarSentidoHorario(anillo: LatLon[]): LatLon[] {
  return areaConSigno(anillo) > 0 ? [...anillo].reverse() : anillo;
}

/** Arma el .shp/.shx de un ÚNICO registro Polygon con una parte ("part")
 * por pieza del lote — así un lote compuesto por varias piezas no
 * contiguas (ver Lote["perimetro"]) queda como un solo polígono
 * multi-parte, en vez de varios registros sueltos. */
function construirShpYShxPoligono(piezasLatLon: LatLon[][]): { shp: Uint8Array; shx: Uint8Array } {
  // Cada anillo, en sentido horario y CERRADO (primer y último punto
  // iguales) — nuestras piezas (ver limpiarPieza en geometria.ts) vienen
  // sin ese cierre repetido, así que se agrega acá.
  const piezas = piezasLatLon.map((anillo) => {
    const horario = asegurarSentidoHorario(anillo);
    return [...horario, horario[0]];
  });

  const todosLosPuntos = piezas.flat();
  const lons = todosLosPuntos.map((p) => p.lon);
  const lats = todosLosPuntos.map((p) => p.lat);
  const minX = Math.min(...lons);
  const maxX = Math.max(...lons);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const numParts = piezas.length;
  const numPoints = todosLosPuntos.length;
  // Contenido del registro Polygon: shape type (4) + box (32) + numParts
  // (4) + numPoints (4) + un índice por parte (4 c/u) + un par X,Y por
  // punto (16 c/u).
  const CONTENIDO_BYTES = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
  const CONTENIDO_WORDS = CONTENIDO_BYTES / 2;
  const REGISTRO_SHP_BYTES = 8 + CONTENIDO_BYTES;

  const shpBuffer = new ArrayBuffer(100 + REGISTRO_SHP_BYTES); // un solo registro
  const shpView = new DataView(shpBuffer);
  escribirCabecera(shpView, (100 + REGISTRO_SHP_BYTES) / 2, SHAPE_TYPE_POLYGON, minX, minY, maxX, maxY);

  const shxBuffer = new ArrayBuffer(100 + 8); // un solo índice
  const shxView = new DataView(shxBuffer);
  escribirCabecera(shxView, (100 + 8) / 2, SHAPE_TYPE_POLYGON, minX, minY, maxX, maxY);

  const inicioRegistro = 100;
  shpView.setInt32(inicioRegistro, 1, false); // número de registro, 1-based, big-endian
  shpView.setInt32(inicioRegistro + 4, CONTENIDO_WORDS, false);
  let cur = inicioRegistro + 8;
  shpView.setInt32(cur, SHAPE_TYPE_POLYGON, true);
  cur += 4;
  shpView.setFloat64(cur, minX, true);
  cur += 8;
  shpView.setFloat64(cur, minY, true);
  cur += 8;
  shpView.setFloat64(cur, maxX, true);
  cur += 8;
  shpView.setFloat64(cur, maxY, true);
  cur += 8;
  shpView.setInt32(cur, numParts, true);
  cur += 4;
  shpView.setInt32(cur, numPoints, true);
  cur += 4;
  let indicePunto = 0;
  for (const anillo of piezas) {
    shpView.setInt32(cur, indicePunto, true);
    cur += 4;
    indicePunto += anillo.length;
  }
  for (const anillo of piezas) {
    for (const p of anillo) {
      shpView.setFloat64(cur, p.lon, true);
      cur += 8;
      shpView.setFloat64(cur, p.lat, true);
      cur += 8;
    }
  }

  shxView.setInt32(100, inicioRegistro / 2, false);
  shxView.setInt32(104, CONTENIDO_WORDS, false);

  return { shp: new Uint8Array(shpBuffer), shx: new Uint8Array(shxBuffer) };
}

/** El .dbf del polígono lleva un solo registro (el lote es UN polígono
 * multi-parte, no uno por pieza) con su nombre — mismo texto que el
 * nombre del archivo, para que quien lo abra en QGIS/ArcGIS vea de
 * entrada qué lote es sin tener que fijarse en el nombre del .zip. */
function construirDbfPoligono(nombre: string): Uint8Array {
  const campos: CampoDbf[] = [{ nombre: "NOMBRE", tipo: "C", largo: 60 }];
  const largoRegistro = 1 + campos.reduce((s, c) => s + c.largo, 0);
  const largoCabecera = 32 + campos.length * 32 + 1;

  const buffer = new ArrayBuffer(largoCabecera + largoRegistro + 1);
  const view = new DataView(buffer);

  const hoy = new Date();
  view.setUint8(0, 0x03);
  view.setUint8(1, hoy.getFullYear() - 1900);
  view.setUint8(2, hoy.getMonth() + 1);
  view.setUint8(3, hoy.getDate());
  view.setUint32(4, 1, true); // un solo registro
  view.setUint16(8, largoCabecera, true);
  view.setUint16(10, largoRegistro, true);

  campos.forEach((campo, i) => {
    const base = 32 + i * 32;
    escribirTextoAscii(view, base, campo.nombre, 11);
    view.setUint8(base + 11, campo.tipo.charCodeAt(0));
    view.setUint8(base + 16, campo.largo);
    view.setUint8(base + 17, 0);
  });
  view.setUint8(32 + campos.length * 32, 0x0d);

  let offset = largoCabecera;
  view.setUint8(offset, 0x20); // registro activo
  escribirTextoAscii(view, offset + 1, nombre, 60);
  offset += largoRegistro;
  view.setUint8(offset, 0x1a); // fin de archivo

  return new Uint8Array(buffer);
}

/** Arma el .zip del shapefile del polígono del lote — mismos 4 archivos
 * que `construirShapefilePuntosZip`, pero como un .zip APARTE (no se
 * mezclan los dos shapefiles en un mismo .zip): así cada uno se abre por
 * separado en QGIS/ArcGIS, como corresponde a dos capas distintas
 * (puntos vs. polígono). */
export async function construirShapefileLotePoligonoZip(piezas: XY[][], origen: LatLon, nombreBase: string): Promise<Uint8Array> {
  const piezasLatLon = piezas.map((pieza) => pieza.map((p) => xyALatLon(origen, p)));
  const { shp, shx } = construirShpYShxPoligono(piezasLatLon);
  const dbf = construirDbfPoligono(nombreBase);

  const zip = new JSZip();
  zip.file(`${nombreBase}.shp`, shp);
  zip.file(`${nombreBase}.shx`, shx);
  zip.file(`${nombreBase}.dbf`, dbf);
  zip.file(`${nombreBase}.prj`, PRJ_WGS84);
  return zip.generateAsync({ type: "uint8array" });
}

/** Comparte el shapefile del polígono del lote — se llama automáticamente
 * justo después de exportar la grilla de puntos en Shapefile (ver
 * confirmarExportarGrilla en vista-general.tsx), nunca por su cuenta: el
 * usuario solo elige el formato/nombre UNA vez, para los puntos, y este
 * segundo archivo sale solo con el nombre del lote (sin pedir nada más). */
export async function exportarShapefileLotePoligono(piezas: XY[][], origen: LatLon, nombreArchivo: string): Promise<void> {
  const nombre = sanitizarNombreArchivo(nombreArchivo);
  const zip = await construirShapefileLotePoligonoZip(piezas, origen, nombre);
  await guardarYCompartirBinario(`${nombre}.zip`, zip, "application/zip");
}

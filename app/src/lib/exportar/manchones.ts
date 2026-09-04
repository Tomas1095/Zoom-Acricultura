// Exportar los manchones de la zona de aplicación a GPX/KMZ — portado del
// prototipo (`exportarGPX`/`exportarKML`), para llevarlos a un GPS de mano
// real o abrirlos en Google Earth / apps de agricultura de precisión.
//
// KMZ en vez de KML puro (a pedido del usuario) — es lo mismo, solo que
// comprimido: pesa menos y es el formato que usa Google Earth por default
// al exportar, así que abre más directo sin que nadie tenga que pensar en
// cuál de los dos es. `construirKML` queda expuesta igual (algún consumo
// futuro que prefiera el KML sin comprimir).

import JSZip from "jszip";
import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { guardarYCompartirBinario, guardarYCompartirTexto, sanitizarNombreArchivo } from "./archivo";
import { escapeXml } from "./xml";

// Namespace GPX 1.1 estándar (topografix) — sin esto algunos programas más
// estrictos (Garmin MapSource, entre otros) rechazan el archivo con "could
// not be imported" aunque el XML esté bien formado.
const GPX_HEADER =
  '<gpx version="1.1" creator="Monitoreo de plagas" ' +
  'xmlns="http://www.topografix.com/GPX/1/1" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">';

export function construirGPX(manchones: XY[][], nombreLote: string, origen: LatLon, prefijo: string): string {
  let rutas = "";
  manchones.forEach((m, i) => {
    const cerrado = [...m, m[0]];
    const pts = cerrado
      .map((v) => {
        const { lat, lon } = xyALatLon(origen, v);
        return `      <rtept lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"></rtept>`;
      })
      .join("\n");
    rutas += `  <rte>\n    <name>${escapeXml(`${prefijo} ${i + 1} - ${nombreLote || "Lote"}`)}</name>\n${pts}\n  </rte>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${GPX_HEADER}\n${rutas}</gpx>`;
}

export function construirKML(manchones: XY[][], nombreLote: string, origen: LatLon, prefijo: string): string {
  let placemarks = "";
  manchones.forEach((m, i) => {
    const cerrado = [...m, m[0]];
    const coords = cerrado
      .map((v) => {
        const { lat, lon } = xyALatLon(origen, v);
        return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
      })
      .join(" ");
    placemarks += `  <Placemark>\n    <name>${escapeXml(`${prefijo} ${i + 1} - ${nombreLote || "Lote"}`)}</name>\n    <Style><PolyStyle><color>7d3fa07b</color></PolyStyle></Style>\n    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n  </Placemark>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n${placemarks}</Document>\n</kml>`;
}

/** `nombreArchivo` es el nombre elegido por la persona (sin extensión, ver
 * ExportarNombreModal) — ya no se arma solo acá adentro. `prefijo` es
 * "BB" o "BAB" según la plaga activa (ver prefijoExportActivo en
 * salidas-view.tsx) — nombra cada manchón individual dentro del archivo
 * (ej. "BB 1 - Lote Tal"), no confundir con el nombre del archivo en sí. */
export async function exportarGPX(
  manchones: XY[][],
  nombreLote: string,
  origen: LatLon,
  nombreArchivo: string,
  prefijo: string
): Promise<void> {
  const gpx = construirGPX(manchones, nombreLote, origen, prefijo);
  await guardarYCompartirTexto(`${sanitizarNombreArchivo(nombreArchivo)}.gpx`, gpx, "application/gpx+xml");
}

export async function exportarKML(
  manchones: XY[][],
  nombreLote: string,
  origen: LatLon,
  nombreArchivo: string,
  prefijo: string
): Promise<void> {
  const kml = construirKML(manchones, nombreLote, origen, prefijo);
  await guardarYCompartirTexto(`${sanitizarNombreArchivo(nombreArchivo)}.kml`, kml, "application/vnd.google-earth.kml+xml");
}

/** Un KML no necesita más que comprimirse tal cual (con el nombre interno
 * "doc.kml", la convención que usa Google Earth) para ser un KMZ válido —
 * ver el comentario del encabezado. */
export async function construirKMZDesdeKML(kml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  return zip.generateAsync({ type: "uint8array" });
}

export async function exportarKMZ(
  manchones: XY[][],
  nombreLote: string,
  origen: LatLon,
  nombreArchivo: string,
  prefijo: string
): Promise<void> {
  const kml = construirKML(manchones, nombreLote, origen, prefijo);
  const kmz = await construirKMZDesdeKML(kml);
  await guardarYCompartirBinario(`${sanitizarNombreArchivo(nombreArchivo)}.kmz`, kmz, "application/vnd.google-earth.kmz");
}

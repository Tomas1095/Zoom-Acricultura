// Exportar los manchones de la zona de aplicación a GPX/KML — portado tal
// cual del prototipo (`exportarGPX`/`exportarKML`), para llevarlos a un GPS
// de mano real o abrirlos en Google Earth / apps de agricultura de precisión.

import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { guardarYCompartirTexto } from "./archivo";

function nombreArchivo(nombreLote: string, extension: string): string {
  return `manchoneo_${(nombreLote || "lote").replace(/\s+/g, "_")}.${extension}`;
}

export function construirGPX(manchones: XY[][], nombreLote: string, origen: LatLon): string {
  let rutas = "";
  manchones.forEach((m, i) => {
    const cerrado = [...m, m[0]];
    const pts = cerrado
      .map((v) => {
        const { lat, lon } = xyALatLon(origen, v);
        return `      <rtept lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"></rtept>`;
      })
      .join("\n");
    rutas += `  <rte>\n    <name>Manchón ${i + 1} - ${nombreLote || "Lote"}</name>\n${pts}\n  </rte>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Monitoreo de plagas">\n${rutas}</gpx>`;
}

export function construirKML(manchones: XY[][], nombreLote: string, origen: LatLon): string {
  let placemarks = "";
  manchones.forEach((m, i) => {
    const cerrado = [...m, m[0]];
    const coords = cerrado
      .map((v) => {
        const { lat, lon } = xyALatLon(origen, v);
        return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
      })
      .join(" ");
    placemarks += `  <Placemark>\n    <name>Manchón ${i + 1} - ${nombreLote || "Lote"}</name>\n    <Style><PolyStyle><color>7d3fa07b</color></PolyStyle></Style>\n    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n  </Placemark>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n${placemarks}</Document>\n</kml>`;
}

export async function exportarGPX(manchones: XY[][], nombreLote: string, origen: LatLon): Promise<void> {
  const gpx = construirGPX(manchones, nombreLote, origen);
  await guardarYCompartirTexto(nombreArchivo(nombreLote, "gpx"), gpx, "application/gpx+xml");
}

export async function exportarKML(manchones: XY[][], nombreLote: string, origen: LatLon): Promise<void> {
  const kml = construirKML(manchones, nombreLote, origen);
  await guardarYCompartirTexto(nombreArchivo(nombreLote, "kml"), kml, "application/vnd.google-earth.kml+xml");
}

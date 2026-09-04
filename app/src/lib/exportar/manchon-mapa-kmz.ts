// "Exportar Manchón + Mapa" — a pedido del usuario: un KMZ con el mapa de
// densidad (las celdas de Voronoi, cada una como su propio polígono de
// verdad — igual a como las exportaba desde ArcGIS) Y el polígono del
// manchón juntos, para abrir en Google Earth y ahí retocar el manchón a
// mano con mouse en vez de con el dedo en el celular — mucho más preciso
// en campos grandes. A diferencia de "Exportar Manchón" (ver
// manchones.ts), esto NO es una imagen pegada: son polígonos KML de
// verdad, así que se ve exactamente igual acercando o alejando el zoom.
// Ni las celdas ni el manchón llevan relleno — solo el borde (ver el
// comentario de construirKMLManchonYMapa), para no tapar la foto
// satelital de fondo.

import JSZip from "jszip";
import type { CeldaDensidad } from "@/lib/geo/densidad";
import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";
import { guardarYCompartirBinario, sanitizarNombreArchivo } from "./archivo";
import { manchonesValidos } from "./manchones";
import { colorKml, escapeXml } from "./xml";

function poligonoKml(vertices: XY[], origen: LatLon): string {
  const cerrado = [...vertices, vertices[0]];
  return cerrado
    .map((v) => {
      const { lat, lon } = xyALatLon(origen, v);
      return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
    })
    .join(" ");
}

export function construirKMLManchonYMapa(
  manchones: XY[][],
  celdas: CeldaDensidad[],
  nivelColores: readonly string[],
  nombreLote: string,
  origen: LatLon,
  prefijo: string
): string {
  // Densidad primero, manchón después — en KML/Google Earth los Placemark
  // se dibujan en orden de documento, así que el manchón queda ARRIBA de
  // las celdas de color (es lo que hay que ver y retocar), no tapado por
  // ellas.
  //
  // Ni las celdas ni el manchón llevan relleno (a pedido del usuario) —
  // solo el borde, para que la foto satelital de Google Earth se vea
  // limpia de fondo mientras se retoca el manchón encima. Las celdas SÍ
  // muestran el cuadriculado completo (el borde de cada celda, tenga o no
  // tenga densidad cargada) coloreado según su nivel — así se sigue
  // viendo de un vistazo cuáles tienen más/menos densidad, sin que el
  // color tape el terreno.
  const celdasKml = celdas
    .map(
      (c) =>
        `    <Placemark>\n      <Style><LineStyle><color>${colorKml(nivelColores[c.nivel])}</color><width>1.5</width></LineStyle><PolyStyle><fill>0</fill><outline>1</outline></PolyStyle></Style>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>${poligonoKml(c.poligono, origen)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>\n`
    )
    .join("");

  const manchonKml = manchonesValidos(manchones)
    .map(
      (m, i) =>
        `    <Placemark>\n      <name>${escapeXml(`${prefijo} ${i + 1} - ${nombreLote || "Lote"}`)}</name>\n      <Style><LineStyle><color>${colorKml(colors.primary)}</color><width>3</width></LineStyle><PolyStyle><fill>0</fill><outline>1</outline></PolyStyle></Style>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>${poligonoKml(m, origen)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>\n`
    )
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n` +
    `  <name>${escapeXml(`${prefijo} + Mapa - ${nombreLote || "Lote"}`)}</name>\n` +
    `  <Folder>\n    <name>Densidad</name>\n${celdasKml}  </Folder>\n` +
    `  <Folder>\n    <name>Manchón</name>\n${manchonKml}  </Folder>\n` +
    `</Document>\n</kml>`
  );
}

export async function exportarKMZManchonYMapa(
  manchones: XY[][],
  celdas: CeldaDensidad[],
  nivelColores: readonly string[],
  nombreLote: string,
  origen: LatLon,
  nombreArchivo: string,
  prefijo: string
): Promise<void> {
  const kml = construirKMLManchonYMapa(manchones, celdas, nivelColores, nombreLote, origen, prefijo);
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const kmz = await zip.generateAsync({ type: "uint8array" });
  await guardarYCompartirBinario(`${sanitizarNombreArchivo(nombreArchivo)}.kmz`, kmz, "application/vnd.google-earth.kmz");
}

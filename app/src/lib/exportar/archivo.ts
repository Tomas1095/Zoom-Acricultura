import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Deja un nombre de archivo elegido a mano (puede traer espacios, tildes,
 * etc. — está bien, tanto iOS como Android los aceptan) listo para escribir
 * a disco: solo saca los caracteres que sí rompen un nombre de archivo real
 * (separadores de carpeta, etc.) y evita que quede vacío. */
export function sanitizarNombreArchivo(nombre: string): string {
  const limpio = nombre.trim().replace(/[/\\:*?"<>|]/g, "-");
  return limpio || "archivo";
}

/** Guarda un texto como archivo temporal y abre la hoja de compartir nativa
 * — el equivalente real de "descargar" en un celular: no hay carpeta de
 * Descargas a la que escribir directo y que después cualquier otra app
 * pueda ver, así que se comparte al toque (a otra app, a Archivos/Drive, a
 * WhatsApp, etc.) en vez de guardarlo silencioso en un lugar fijo. */
export async function guardarYCompartirTexto(nombreArchivo: string, contenido: string, mimeType: string): Promise<void> {
  await guardarYCompartir(nombreArchivo, contenido, mimeType);
}

/** Igual que `guardarYCompartirTexto`, pero para contenido binario (el
 * .zip del shapefile, ver exportar/shapefile.ts) — `File.write` acepta
 * tanto texto como un `Uint8Array` tal cual. */
export async function guardarYCompartirBinario(nombreArchivo: string, contenido: Uint8Array, mimeType: string): Promise<void> {
  await guardarYCompartir(nombreArchivo, contenido, mimeType);
}

/** En la web no hay ni hoja de compartir nativa ni `expo-file-system` real
 * (no hay "disco" del que hablar) — el equivalente de "exportar un
 * archivo" ahí es lisa y llanamente descargarlo, con el truco de siempre
 * en cualquier página: un `<a download>` armado en memoria, apuntando a un
 * Blob, clickeado por código y descartado enseguida. El navegador se
 * encarga de dónde cae (la carpeta de Descargas de la persona), no hace
 * falta elegir nada nosotros. */
function descargarEnWeb(nombreArchivo: string, contenido: string | Uint8Array, mimeType: string): void {
  // El cast es solo para calmar al tipo `BlobPart` de TS (que exige un
  // ArrayBuffer, nunca un SharedArrayBuffer, de más estricto que hace
  // falta acá) — nuestros Uint8Array siempre salen de un ArrayBuffer
  // armado a mano (ver shapefile.ts) o de JSZip, nunca de memoria
  // compartida entre threads.
  const blob = new Blob([contenido as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Recién después de un toque, no antes — revocar la URL de golpe podía
  // cortar la descarga en algún navegador si se dispara demasiado rápido.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function guardarYCompartir(nombreArchivo: string, contenido: string | Uint8Array, mimeType: string): Promise<void> {
  if (Platform.OS === "web") {
    descargarEnWeb(nombreArchivo, contenido, mimeType);
    return;
  }

  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) throw new Error("Compartir no está disponible en este dispositivo.");

  const archivo = new File(Paths.cache, nombreArchivo);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(contenido);

  await Sharing.shareAsync(archivo.uri, { mimeType, dialogTitle: nombreArchivo });
}

/** Igual que `guardarYCompartirTexto`/`guardarYCompartirBinario`, pero
 * partiendo de un archivo que YA existe en disco (p.ej. la captura de
 * pantalla de una vista, ver exportar/mapa-png.ts) — lo copia con el
 * nombre elegido por la persona (el original, de `react-native-view-shot`,
 * tiene un nombre autogenerado) y comparte esa copia.
 *
 * Sin equivalente en web (no la usa nada de lo que corre ahí — "Exportar
 * PNG" del mapa depende de `react-native-view-shot`, que es nativo puro,
 * ver mapa-png.ts) — si algún día hiciera falta, la captura en sí tendría
 * que resolverse antes con otra librería (p.ej. `html-to-image` sobre el
 * DOM), esta función ya no alcanzaría con solo agregarle la rama web. */
export async function guardarYCompartirDesdeArchivo(nombreArchivo: string, uriOrigen: string, mimeType: string): Promise<void> {
  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) throw new Error("Compartir no está disponible en este dispositivo.");

  const origen = new File(uriOrigen);
  const destino = new File(Paths.cache, nombreArchivo);
  if (destino.exists) destino.delete();
  origen.copy(destino);

  await Sharing.shareAsync(destino.uri, { mimeType, dialogTitle: nombreArchivo });
}

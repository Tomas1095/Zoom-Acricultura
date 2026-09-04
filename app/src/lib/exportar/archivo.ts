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

async function guardarYCompartir(nombreArchivo: string, contenido: string | Uint8Array, mimeType: string): Promise<void> {
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
 * tiene un nombre autogenerado) y comparte esa copia. */
export async function guardarYCompartirDesdeArchivo(nombreArchivo: string, uriOrigen: string, mimeType: string): Promise<void> {
  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) throw new Error("Compartir no está disponible en este dispositivo.");

  const origen = new File(uriOrigen);
  const destino = new File(Paths.cache, nombreArchivo);
  if (destino.exists) destino.delete();
  origen.copy(destino);

  await Sharing.shareAsync(destino.uri, { mimeType, dialogTitle: nombreArchivo });
}

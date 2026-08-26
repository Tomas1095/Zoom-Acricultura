import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Guarda un texto como archivo temporal y abre la hoja de compartir nativa
 * — el equivalente real de "descargar" en un celular: no hay carpeta de
 * Descargas a la que escribir directo y que después cualquier otra app
 * pueda ver, así que se comparte al toque (a otra app, a Archivos/Drive, a
 * WhatsApp, etc.) en vez de guardarlo silencioso en un lugar fijo. */
export async function guardarYCompartirTexto(nombreArchivo: string, contenido: string, mimeType: string): Promise<void> {
  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) throw new Error("Compartir no está disponible en este dispositivo.");

  const archivo = new File(Paths.cache, nombreArchivo);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(contenido);

  await Sharing.shareAsync(archivo.uri, { mimeType, dialogTitle: nombreArchivo });
}

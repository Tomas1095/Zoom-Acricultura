import { File } from "expo-file-system";

import { supabase } from "@/lib/supabase";
import type { ArchivoCliente } from "@/types/domain";
import { filaAArchivoCliente } from "./mappers";

const BUCKET = "archivos-cliente";

// Del `uri` del archivo elegido (nunca del nombre que la persona termine
// escribiendo/editando en el modal, que es libre y puede no tener
// extensión) — así el content-type real en Storage siempre coincide con el
// archivo de verdad, pase lo que pase con el nombre a la vista.
function extensionDeUri(uri: string): string {
  const sinQuery = uri.split("?")[0];
  const m = sinQuery.match(/\.(\w+)$/);
  return (m?.[1] || "xlsx").toLowerCase();
}

function contentTypeDeExtension(ext: string): string {
  if (ext === "xls") return "application/vnd.ms-excel";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

/** Nombre de archivo + content-type para abrir/compartir un ArchivoCliente
 * ya subido — la extensión sale de `storagePath` (siempre la real, ver
 * subirArchivoCliente), nunca de `nombreArchivo` (el que ve la persona,
 * editable a mano y puede no traerla). Si `nombreArchivo` ya termina en
 * esa extensión (case-insensitive) no la duplica. */
export function datosDeAperturaArchivoCliente(archivo: Pick<ArchivoCliente, "nombreArchivo" | "storagePath">): {
  nombreArchivo: string;
  mimeType: string;
} {
  const ext = extensionDeUri(archivo.storagePath);
  const yaTraeExtension = archivo.nombreArchivo.toLowerCase().endsWith(`.${ext}`);
  return {
    nombreArchivo: yaTraeExtension ? archivo.nombreArchivo : `${archivo.nombreArchivo}.${ext}`,
    mimeType: contentTypeDeExtension(ext),
  };
}

/** Todos los archivos subidos a mano para un cliente — ordenados por
 * nombre. A pedido del usuario: el Excel "resumen de aplicación de cebo"
 * que arma en su computadora y le entrega a cada cliente. */
export async function fetchArchivosCliente(clienteId: string): Promise<ArchivoCliente[]> {
  const { data, error } = await supabase
    .from("archivos_cliente")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("nombre_archivo");
  if (error) throw error;
  return (data ?? []).map(filaAArchivoCliente);
}

/** `archivoLocal` ya elegido del selector del sistema (ver
 * File.pickFileAsync en el modal) — `nombreMostrar` es el nombre que la
 * persona confirmó/editó en el modal (solo para la lista, no tiene por qué
 * traer extensión). La extensión real/content-type sale del `uri` del
 * propio archivo, no de `nombreMostrar` — así da igual qué haya escrito la
 * persona, el archivo subido siempre queda con el tipo correcto. El nombre
 * dentro del bucket en sí es un ID único (mismo criterio que
 * lib/storage/fotos.ts), nunca el nombre original ni el que se muestra. */
export async function subirArchivoCliente(clienteId: string, archivoLocal: File, nombreMostrar: string): Promise<void> {
  const ext = extensionDeUri(archivoLocal.uri);
  const bytes = await archivoLocal.bytes();
  const path = `${clienteId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: contentTypeDeExtension(ext),
  });
  if (errorSubida) throw errorSubida;

  const { error } = await supabase.from("archivos_cliente").insert({
    cliente_id: clienteId,
    nombre_archivo: nombreMostrar,
    storage_path: path,
  });
  if (error) throw error;
}

export async function getArchivoClienteUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function eliminarArchivoCliente(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from("archivos_cliente").delete().eq("id", id);
  if (error) throw error;
}

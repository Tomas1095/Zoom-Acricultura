import { File } from "expo-file-system";

import { supabase } from "@/lib/supabase";
import type { InformeEstablecimiento } from "@/types/domain";
import { filaAInformeEstablecimiento } from "./mappers";

const BUCKET = "informes-establecimiento";

/** Todos los informes guardados de un establecimiento — ordenados por
 * campaña (más reciente primero) y, dentro de cada campaña, por nombre.
 * Portado tal cual lo pidió el usuario ("si se exportaron para la campaña
 * 26/27 los lote 1 y lote 2, deberían aparecer esos dos pdf"). */
export async function fetchInformesEstablecimiento(establecimientoId: string): Promise<InformeEstablecimiento[]> {
  const { data, error } = await supabase
    .from("informes_establecimiento")
    .select("*")
    .eq("establecimiento_id", establecimientoId)
    .order("campana", { ascending: false })
    .order("nombre_archivo");
  if (error) throw error;
  return (data ?? []).map(filaAInformeEstablecimiento);
}

/** Sube el PDF ya generado (ver exportarInformePdf/generarInformePdfLocal en
 * lib/exportar/informe.ts) al historial del establecimiento — acción
 * explícita, disparada solo por el botón "Exportar PDF y guardar en
 * historial" de Salidas, nunca automática en cualquier export. El nombre
 * real dentro del bucket es un ID único (mismo criterio que
 * lib/storage/fotos.ts) para no pisar archivos entre sí — el nombre que ve
 * la persona (`nombreArchivo`) solo vive en la fila de la base. */
export async function guardarInformeEstablecimiento(
  establecimientoId: string,
  campana: string,
  nombreArchivo: string,
  archivoLocal: File
): Promise<void> {
  const bytes = await archivoLocal.bytes();
  const path = `${establecimientoId}/${campana}/${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;

  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
  });
  if (errorSubida) throw errorSubida;

  const { error } = await supabase.from("informes_establecimiento").insert({
    establecimiento_id: establecimientoId,
    campana,
    nombre_archivo: nombreArchivo,
    storage_path: path,
  });
  if (error) throw error;
}

/** Bucket privado (igual que fotos-monitoreo) — hace falta una URL firmada
 * para poder abrir/descargar un informe puntual. */
export async function getInformeEstablecimientoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function eliminarInformeEstablecimiento(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from("informes_establecimiento").delete().eq("id", id);
  if (error) throw error;
}

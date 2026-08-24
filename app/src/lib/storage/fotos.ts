import { File } from "expo-file-system";

import { supabase } from "@/lib/supabase";

const BUCKET = "fotos-monitoreo";

function extension(uri: string): string {
  const m = uri.match(/\.(\w+)(\?.*)?$/);
  return (m?.[1] || "jpg").toLowerCase();
}

/** Sube una foto tomada/elegida a Supabase Storage y devuelve el path
 * guardado (no la URL — el bucket es privado, la URL se pide al vuelo con
 * `getFotoUrl`). */
export async function subirFoto(loteId: string, puntoId: string, uriLocal: string): Promise<string> {
  const archivo = new File(uriLocal);
  const bytes = await archivo.bytes();
  const nombre = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension(uriLocal)}`;
  const path = `${loteId}/${puntoId}/${nombre}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: `image/${extension(uriLocal) === "png" ? "png" : "jpeg"}`,
  });
  if (error) throw error;
  return path;
}

export async function getFotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function eliminarFoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

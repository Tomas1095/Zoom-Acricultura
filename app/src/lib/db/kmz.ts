import { supabase } from "@/lib/supabase";
import type { GrillaGenerada } from "@/lib/geo/geometria";

/** Guarda la grilla generada desde el KMZ: actualiza el lote (hectáreas,
 * perímetro, tiene_grilla) e inserta todos los puntos de muestreo. */
export async function guardarGrillaGenerada(loteId: string, grilla: GrillaGenerada, haPorPunto: number): Promise<void> {
  const { error: errorLote } = await supabase
    .from("lotes")
    .update({
      hectareas: grilla.hectareas,
      ha_por_punto: haPorPunto,
      perimetro: grilla.perimetroXY,
      tiene_grilla: true,
    })
    .eq("id", loteId);
  if (errorLote) throw errorLote;

  const filas = grilla.puntos.map((p) => ({
    lote_id: loteId,
    linea: p.linea,
    punto_num: p.puntoNum,
    lat: p.lat,
    lon: p.lon,
    x: p.x,
    y: p.y,
  }));
  const { error: errorPuntos } = await supabase.from("puntos").insert(filas);
  if (errorPuntos) throw errorPuntos;
}

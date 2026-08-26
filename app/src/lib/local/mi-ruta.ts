// Recorrido personal (ayuda memoria) de cada Monitoreador — portado tal
// cual de `cargarMiRuta`/`guardarMiRuta` del prototipo, cambiando
// localStorage por AsyncStorage (ya lo usa `lib/supabase.ts` para la
// sesión). Vive solo en ESTE celular: no hay tabla en Supabase para esto ni
// falta que la haya — nunca se sincroniza con nadie más, es nada más una
// ayuda memoria de quien lo arma.

import AsyncStorage from "@react-native-async-storage/async-storage";

function claveRuta(loteId: string, usuarioId: string): string {
  return `miRuta_${loteId}_${usuarioId}`;
}
function claveConfirmada(loteId: string, usuarioId: string): string {
  return `miRutaConf_${loteId}_${usuarioId}`;
}

export async function cargarMiRuta(loteId: string, usuarioId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(claveRuta(loteId, usuarioId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function guardarMiRuta(loteId: string, usuarioId: string, ruta: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(claveRuta(loteId, usuarioId), JSON.stringify(ruta));
  } catch {
    // si falla (guardado lleno, etc.) no se guarda entre sesiones — no rompe nada más
  }
}

export async function cargarRutaConfirmada(loteId: string, usuarioId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(claveConfirmada(loteId, usuarioId))) === "1";
  } catch {
    return false;
  }
}

export async function guardarRutaConfirmada(loteId: string, usuarioId: string, confirmada: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(claveConfirmada(loteId, usuarioId), confirmada ? "1" : "0");
  } catch {
    // ídem — no rompe nada
  }
}

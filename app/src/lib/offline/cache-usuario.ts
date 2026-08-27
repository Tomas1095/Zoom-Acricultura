// Cache local del perfil de `usuarios` de la persona logueada — sin esto,
// reabrir la app ya sin señal (por ej. la cerraron del todo mientras
// caminaban el campo, o el sistema operativo la mató en background) hacía
// que `cargarUsuario` en auth-context.tsx fallara al pedir el perfil al
// server, y como el gate de (app)/_layout.tsx exige `usuario` para dejar
// pasar, la persona quedaba mandada de vuelta al login — un login que
// tampoco puede completarse sin señal. La sesión de auth en sí ya persiste
// sola vía AsyncStorage (ver lib/supabase.ts, `persistSession`); esto hace
// lo mismo para el perfil (rol, nombre, etc.), que es una consulta aparte.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Usuario } from "@/types/domain";

const KEY = "zoom-agricultura:cache-usuario";

export async function guardarUsuarioCache(usuario: Usuario): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(usuario));
  } catch {
    // No hay mucho que hacer si falla guardar la cache — la próxima vez
    // que haya señal se vuelve a intentar.
  }
}

/** Solo devuelve la cache si es del MISMO usuario de auth que está pidiendo
 * el perfil — evita que, en un celular donde se usaron dos cuentas
 * distintas, alguien vea offline el perfil de la sesión anterior. */
export async function leerUsuarioCache(authUserId: string): Promise<Usuario | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const usuario: Usuario = JSON.parse(raw);
    return usuario.authUserId === authUserId ? usuario : null;
  } catch {
    return null;
  }
}

// Cache local del perfil de `usuarios` (+ su comunidad) de la persona
// logueada — sin esto, reabrir la app ya sin señal (por ej. la cerraron del
// todo mientras caminaban el campo, o el sistema operativo la mató en
// background) hacía que `cargarUsuario` en auth-context.tsx fallara al
// pedir el perfil al server, y como el gate de (app)/_layout.tsx exige
// `usuario` para dejar pasar, la persona quedaba mandada de vuelta al
// login — un login que tampoco puede completarse sin señal. La sesión de
// auth en sí ya persiste sola vía AsyncStorage (ver lib/supabase.ts,
// `persistSession`); esto hace lo mismo para el perfil (rol, nombre, etc.)
// y su comunidad (nombre, estado — hace falta para el gate de "pendiente"
// en app/index.tsx), que son consultas aparte.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Comunidad, Usuario } from "@/types/domain";

const KEY = "zoom-agricultura:cache-usuario";

interface PerfilCache {
  usuario: Usuario;
  comunidad: Comunidad | null;
}

export async function guardarUsuarioCache(usuario: Usuario, comunidad: Comunidad | null): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ usuario, comunidad } satisfies PerfilCache));
  } catch {
    // No hay mucho que hacer si falla guardar la cache — la próxima vez
    // que haya señal se vuelve a intentar.
  }
}

/** Solo devuelve la cache si es del MISMO usuario de auth que está pidiendo
 * el perfil — evita que, en un celular donde se usaron dos cuentas
 * distintas, alguien vea offline el perfil de la sesión anterior. */
export async function leerUsuarioCache(authUserId: string): Promise<PerfilCache | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const perfil: PerfilCache = JSON.parse(raw);
    return perfil.usuario?.authUserId === authUserId ? perfil : null;
  } catch {
    return null;
  }
}

/** Igual que `leerUsuarioCache`, pero sin nada contra qué comparar — para
 * cuando ni siquiera hay un `authUserId` de una sesión viva (ver
 * auth-context.tsx: el token de acceso venció de verdad y no hay señal
 * para renovarlo, así que `getSession()` no devuelve nada con qué
 * comparar). Es seguro devolver lo que haya sin chequeo porque
 * `signOut()` borra esta cache (ver `borrarUsuarioCache`) — si hay algo
 * guardado acá, es de la sesión que sigue activa en este celular, nunca
 * de una cuenta anterior que ya cerró sesión. */
export async function leerUltimoUsuarioCache(): Promise<PerfilCache | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PerfilCache) : null;
  } catch {
    return null;
  }
}

/** Se llama al cerrar sesión — sin esto, la cache de un usuario quedaba
 * pegada en el celular para siempre después de cerrar sesión, lista para
 * que `leerUltimoUsuarioCache` (sin chequeo de a quién pertenece) se la
 * mostrara sin querer a la persona que loguee después en el mismo
 * dispositivo, si llegara a intentarlo sin señal antes de loguearse de
 * verdad. */
export async function borrarUsuarioCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // no hay mucho que hacer si falla — no es data sensible más allá de
    // nombre/rol/comunidad, y de todos modos se pisa sola en el próximo
    // login exitoso.
  }
}

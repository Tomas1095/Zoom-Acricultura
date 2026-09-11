import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { filaAComunidad, filaAUsuario } from "./db/mappers";
import { borrarUsuarioCache, guardarUsuarioCache, leerUltimoUsuarioCache, leerUsuarioCache } from "./offline/cache-usuario";
import { conTimeout, hayConexion } from "./offline/net";
import type { Comunidad, Usuario } from "@/types/domain";

interface AuthState {
  /** null mientras se resuelve la sesión guardada en el dispositivo. */
  loading: boolean;
  session: Session | null;
  /** Fila de `usuarios` correspondiente a la sesión — null si hay sesión de
   * auth pero todavía no hay perfil (recién canjeó invitación, por ejemplo). */
  usuario: Usuario | null;
  /** La comunidad de `usuario` — null en el mismo caso que `usuario` sea
   * null. Mientras no esté "activa" (pendiente/rechazada, ver
   * types/domain.ts), el gate de app/index.tsx manda a
   * comunidad-pendiente.tsx en vez de dejar entrar a la app. */
  comunidad: Comunidad | null;
  refrescarUsuario: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [comunidad, setComunidad] = useState<Comunidad | null>(null);

  async function cargarUsuario(authUserId: string) {
    try {
      if (!(await hayConexion())) throw new Error("Sin conexión");
      const { data, error } = await conTimeout(
        supabase.from("usuarios").select("*").eq("auth_user_id", authUserId).maybeSingle()
      );
      if (error) throw error;
      const u = data ? filaAUsuario(data) : null;

      let c: Comunidad | null = null;
      if (u) {
        const { data: cdata, error: cerror } = await conTimeout(
          supabase.from("comunidades").select("*").eq("id", u.comunidadId).maybeSingle()
        );
        if (cerror) throw cerror;
        c = cdata ? filaAComunidad(cdata) : null;
      }

      setUsuario(u);
      setComunidad(c);
      if (u) guardarUsuarioCache(u, c);
    } catch (e: any) {
      // Sin señal: la sesión de auth ya se restauró sola desde el
      // dispositivo (ver lib/supabase.ts, persistSession), pero este
      // perfil es una consulta aparte al server. Sin este respaldo,
      // reabrir la app ya sin señal (por ej. después de cerrarla del todo
      // en el campo) mandaba a la persona de vuelta al login — un login
      // que tampoco puede completarse sin señal. Ver
      // lib/offline/cache-usuario.ts.
      const cache = await leerUsuarioCache(authUserId);
      setUsuario(cache?.usuario ?? null);
      setComunidad(cache?.comunidad ?? null);
      if (!cache) console.warn("No se pudo cargar el perfil de usuario:", e.message ?? String(e));
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error }) => {
      setSession(data.session);
      if (data.session) {
        await cargarUsuario(data.session.user.id);
        setLoading(false);
        return;
      }
      // Sin sesión viva. Si fue porque de verdad no hay ninguna sesión (no
      // se logueó nunca en este celular, o cerró sesión), acá termina —
      // vacío está bien. Pero si `error` es un fallo de RED al intentar
      // renovar el token (el celular llega al campo sin señal más de una
      // hora después de la última vez que se abrió la app, con el access
      // token ya vencido de verdad — supabase-js ya no lo puede dar por
      // válido sin poder renovarlo) NO es lo mismo que una sesión
      // realmente inválida/revocada: se restaura el último perfil
      // guardado localmente (mismo criterio que ya usaba `cargarUsuario`
      // más abajo para cuando SÍ hay sesión pero el pedido del perfil
      // falla sin señal) — si no, la persona queda mandada a un login que
      // tampoco puede completar sin señal, sin poder ver ni lo que ya
      // tenía cargado en el celular. Apenas vuelva a tener señal, el
      // refresco automático de supabase-js reconstruye la sesión de
      // verdad sola (por eso entra "sin loguearse" apenas engancha 4G).
      if (error && isAuthRetryableFetchError(error)) {
        const cache = await leerUltimoUsuarioCache();
        setUsuario(cache?.usuario ?? null);
        setComunidad(cache?.comunidad ?? null);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nuevaSession) => {
      setSession(nuevaSession);
      if (nuevaSession) {
        cargarUsuario(nuevaSession.user.id);
      } else if (event !== "INITIAL_SESSION") {
        // `INITIAL_SESSION` con sesión null se dispara SIEMPRE al
        // suscribirse acá arriba, en paralelo con el `getSession()` de
        // más arriba — misma ambigüedad (sesión vencida de verdad vs. sin
        // señal para renovarla) que ese `.then()` ya resolvió, restaurando
        // el perfil de la cache si correspondía. Sin este chequeo, este
        // handler pisaba ese restablecimiento al toque, vaciando de nuevo
        // usuario/comunidad — la persona veía la app abrirse un instante y
        // mandarla igual al login. Un evento real después (cerrar sesión
        // de verdad, por ejemplo) sí tiene que vaciar el perfil acá.
        setUsuario(null);
        setComunidad(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      usuario,
      comunidad,
      refrescarUsuario: async () => {
        if (session) await cargarUsuario(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        // Sin esto, el perfil de esta cuenta quedaba guardado en el
        // celular para siempre después de cerrar sesión — ver el
        // comentario de `leerUltimoUsuarioCache` en cache-usuario.ts.
        await borrarUsuarioCache();
      },
    }),
    [loading, session, usuario, comunidad]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

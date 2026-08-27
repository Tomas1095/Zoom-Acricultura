import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { filaAUsuario } from "./db/mappers";
import { guardarUsuarioCache, leerUsuarioCache } from "./offline/cache-usuario";
import type { Usuario } from "@/types/domain";

interface AuthState {
  /** null mientras se resuelve la sesión guardada en el dispositivo. */
  loading: boolean;
  session: Session | null;
  /** Fila de `usuarios` correspondiente a la sesión — null si hay sesión de
   * auth pero todavía no hay perfil (recién canjeó invitación, por ejemplo). */
  usuario: Usuario | null;
  refrescarUsuario: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  async function cargarUsuario(authUserId: string) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error) throw error;
      const u = data ? filaAUsuario(data) : null;
      setUsuario(u);
      if (u) guardarUsuarioCache(u);
    } catch (e: any) {
      // Sin señal: la sesión de auth ya se restauró sola desde el
      // dispositivo (ver lib/supabase.ts, persistSession), pero este
      // perfil es una consulta aparte al server. Sin este respaldo,
      // reabrir la app ya sin señal (por ej. después de cerrarla del todo
      // en el campo) mandaba a la persona de vuelta al login — un login
      // que tampoco puede completarse sin señal. Ver
      // lib/offline/cache-usuario.ts.
      const cache = await leerUsuarioCache(authUserId);
      setUsuario(cache);
      if (!cache) console.warn("No se pudo cargar el perfil de usuario:", e.message ?? String(e));
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) cargarUsuario(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSession) => {
      setSession(nuevaSession);
      if (nuevaSession) cargarUsuario(nuevaSession.user.id);
      else setUsuario(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      usuario,
      refrescarUsuario: async () => {
        if (session) await cargarUsuario(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, usuario]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

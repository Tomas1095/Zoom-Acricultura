import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { colors } from "@/theme/colors";

/** Punto de entrada: solo decide a dónde mandar según el estado de auth. */
export default function Index() {
  const { loading, usuario, comunidad } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // No exige `session` en vivo a propósito — sin señal, con el access
  // token ya vencido, supabase-js no puede confirmar una sesión válida
  // (ver auth-context.tsx), pero `usuario` sigue viniendo del perfil
  // guardado en el celular. Mandar al login en ese caso sería mandar a
  // una pantalla que tampoco se puede completar sin señal.
  if (!usuario) return <Redirect href="/login" />;
  // Falla "cerrado": hace falta una comunidad conocida y activa para entrar
  // — comunidad recién pedida (o rechazada, o todavía sin resolver) manda a
  // la pantalla de espera, no a la app. Ver comunidad-pendiente.tsx.
  if (!comunidad || comunidad.estado !== "activa") return <Redirect href="/comunidad-pendiente" />;
  return <Redirect href="/(app)" />;
}

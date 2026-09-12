import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Building2, UserCircle, Users } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { etiquetaRol, puedeGestionarEquipo } from "@/lib/roles";
import { contarComunidadesPendientes } from "@/lib/db/comunidades";
import { ArbolLotes } from "@/features/lotes/arbol-lotes";
import { MisLotes } from "@/features/lotes/mis-lotes";
import { AppHeader } from "@/components/app-header";
import { commitDelBuild, versionDelBuild } from "@/lib/version";
import { colors } from "@/theme/colors";

export default function MisLotesScreen() {
  const { usuario } = useAuth();
  const commit = commitDelBuild();
  const version = versionDelBuild();
  // Aviso de solicitudes de comunidad esperando aprobación — solo importa
  // (y solo se pide) para quien administra la plataforma entera, no para
  // el resto del equipo. Un puntito rojo alcanza para que Tomás lo note sin
  // tener que entrar a mirar la pantalla cada vez.
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!usuario?.adminPlataforma) return;
    contarComunidadesPendientes()
      .then(setPendientes)
      .catch(() => {});
  }, [usuario?.adminPlataforma]);

  if (!usuario) return null;

  const esAdministrador = usuario.rol !== "monitoreador";

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <AppHeader />
      <View style={styles.cabecera}>
        <View>
          <Text style={styles.saludo}>Hola, {usuario.nombre}</Text>
          <Text style={styles.rol}>{etiquetaRol(usuario.rol)}</Text>
        </View>
        <View style={styles.accionesCabecera}>
          {usuario.adminPlataforma && (
            <Pressable style={styles.iconBtn} onPress={() => router.push("/(app)/solicitudes-comunidad")}>
              <Building2 size={20} color={colors.primaryDark} />
              {pendientes > 0 && <View style={styles.puntoAviso} />}
            </Pressable>
          )}
          {puedeGestionarEquipo(usuario.rol) && (
            <Pressable style={styles.iconBtn} onPress={() => router.push("/(app)/equipo")}>
              <Users size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          {/* Antes era directo un ícono de "cerrar sesión" acá — ahora
              lleva a "Mi cuenta" (ver mi-cuenta.tsx), que además de cerrar
              sesión tiene la opción de eliminar la cuenta (a pedido de
              Apple, App Review — una app que permite crear cuenta tiene
              que poder borrarla también, no solo cerrar sesión). */}
          <Pressable style={styles.iconBtn} onPress={() => router.push("/(app)/mi-cuenta")}>
            <UserCircle size={20} color={colors.primaryDark} />
          </Pressable>
        </View>
      </View>

      {esAdministrador ? <ArbolLotes /> : <MisLotes />}

      {/* A pedido del usuario: poder comparar de un vistazo, en el campo
       * con el resto del equipo, si todos tienen la misma versión
       * instalada — mismo texto que ya se muestra en la pantalla de
       * ingreso (ver lib/version.ts), acá además visible sin tener que
       * cerrar sesión para volver a esa pantalla. La versión (ej.
       * "1.0.1 (4)") es la que hay que mirar para comparar contra lo que
       * figura en App Store Connect/TestFlight — el commit al lado es
       * solo el detalle interno de git, para cuando hace falta algo más
       * fino que la versión. */}
      {(version || commit) && (
        <Text style={styles.version}>
          {version ? `v${version}` : ""}
          {version && commit ? " · " : ""}
          {commit ?? ""}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  saludo: { fontSize: 17, fontWeight: "700", color: colors.text },
  rol: { fontSize: 12, color: colors.accentGold, fontWeight: "600" },
  accionesCabecera: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 8 },
  puntoAviso: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  version: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 10,
    paddingVertical: 6,
  },
});

import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Building2, UserCircle, Users } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { etiquetaRol, puedeGestionarEquipo } from "@/lib/roles";
import { contarComunidadesPendientes } from "@/lib/db/comunidades";
import { ArbolLotes, type ArbolLotesHandle } from "@/features/lotes/arbol-lotes";
import { MisLotes, type MisLotesHandle } from "@/features/lotes/mis-lotes";
import { PrecargaPill } from "@/features/lotes/precarga-pill";
import { AppHeader } from "@/components/app-header";
import { SincronizarPill } from "@/components/sincronizar-pill";
import { commitDelBuild, versionDelBuild } from "@/lib/version";
import { colors } from "@/theme/colors";

export default function MisLotesScreen() {
  const { usuario } = useAuth();
  const insets = useSafeAreaInsets();
  const commit = commitDelBuild();
  const version = versionDelBuild();
  // Aviso de solicitudes de comunidad esperando aprobación — solo importa
  // (y solo se pide) para quien administra la plataforma entera, no para
  // el resto del equipo. Un puntito rojo alcanza para que Tomás lo note sin
  // tener que entrar a mirar la pantalla cada vez.
  const [pendientes, setPendientes] = useState(0);

  // Estado de la precarga (descarga para trabajar sin señal) — ArbolLotes/
  // MisLotes lo siguen calculando ellos (son quienes de verdad piden los
  // datos), pero la pastilla en sí se dibuja acá arriba, fija, junto a la
  // de sincronizar — a pedido del usuario: quería las dos SIEMPRE visibles
  // al scrollear la lista, no que una se fuera con el resto del contenido.
  const [precargando, setPrecargando] = useState(false);
  const [precargaLista, setPrecargaLista] = useState(false);
  const arbolLotesRef = useRef<ArbolLotesHandle>(null);
  const misLotesRef = useRef<MisLotesHandle>(null);

  function onPrecargaCambio(precargandoNuevo: boolean, listaNuevo: boolean) {
    setPrecargando(precargandoNuevo);
    setPrecargaLista(listaNuevo);
  }

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
      {/* AppHeader ya no muestra la pastilla de sincronizar (ver ese
       * componente) — solo vive acá abajo, junto a la de precarga, a
       * pedido del usuario: las quería ver juntas, una debajo de la otra,
       * en vez de una sola separada en el header oscuro. */}
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

      {/* Las dos pastillas quedan FIJAS acá, fuera del ScrollView que arma
       * ArbolLotes/MisLotes — a pedido del usuario: al scrollear la lista
       * de lotes, "Todo sincronizado" quedaba fija pero "Listo para ir al
       * campo" se iba con el resto del contenido, y las quería a las dos
       * siempre a la vista. */}
      <View style={styles.pillsFila}>
        <SincronizarPill />
        <PrecargaPill
          precargando={precargando}
          lista={precargaLista}
          onPress={() => (esAdministrador ? arbolLotesRef.current : misLotesRef.current)?.refrescarManual()}
        />
      </View>

      {esAdministrador ? (
        <ArbolLotes ref={arbolLotesRef} onPrecargaCambio={onPrecargaCambio} />
      ) : (
        <MisLotes ref={misLotesRef} onPrecargaCambio={onPrecargaCambio} />
      )}

      {/* A pedido del usuario: poder comparar de un vistazo, en el campo
       * con el resto del equipo, si todos tienen la misma versión
       * instalada — mismo texto que ya se muestra en la pantalla de
       * ingreso (ver lib/version.ts), acá además visible sin tener que
       * cerrar sesión para volver a esa pantalla. La versión (ej.
       * "1.0.1 (4)") es la que hay que mirar para comparar contra lo que
       * figura en App Store Connect/TestFlight — el commit al lado es
       * solo el detalle interno de git, para cuando hace falta algo más
       * fino que la versión. */}
      {/* Layout fijo (ArbolLotes/MisLotes arriba se encargan de su propio
       * scroll interno) — este texto es lo último de la columna, pegado
       * al borde real de la pantalla. Sin el margen del sistema acá,
       * quedaba tapado por la barra de navegación de Android en algunos
       * celulares — mismo bug que "Exportar PNG" en Resultados. En
       * iPhone, en cambio, el propio inset ya deja bastante aire de más
       * para un simple renglón de texto (no hay nada tocable ahí abajo
       * que necesite todo ese margen) — a pedido del usuario, en iOS se
       * usa la mitad; en Android se deja el inset completo, que sigue
       * siendo el que hace falta para no quedar tapado por la barra de
       * navegación. */}
      {(version || commit) && (
        <Text
          style={[
            styles.version,
            { paddingBottom: 6 + (Platform.OS === "ios" ? Math.round(insets.bottom / 2) : insets.bottom) },
          ]}
        >
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
  pillsFila: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
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

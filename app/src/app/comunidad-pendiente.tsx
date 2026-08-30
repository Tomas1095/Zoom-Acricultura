import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Clock, LogOut, XCircle } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { ZoomLogo } from "@/components/zoom-logo";
import { colors } from "@/theme/colors";

/** Pantalla de espera para quien acaba de pedir crear una comunidad nueva
 * (ver login.tsx, modo "crear-comunidad") — no entra a la app hasta que el
 * administrador de la plataforma apruebe la solicitud (ver
 * lib/db/comunidades.ts, revisarComunidad, y la pantalla que usa eso,
 * features/comunidad/solicitudes-screen.tsx). "Tirar para actualizar" en
 * vez de reintentar sola cada tanto: la aprobación la hace una persona, no
 * algo instantáneo, así que no hay apuro real en golpear el server solo. */
export default function ComunidadPendienteScreen() {
  const insets = useSafeAreaInsets();
  const { session, usuario, comunidad, refrescarUsuario, signOut } = useAuth();
  const [refrescando, setRefrescando] = useState(false);

  if (!session || !usuario) return <Redirect href="/login" />;
  if (comunidad && comunidad.estado === "activa") return <Redirect href="/(app)" />;

  async function refrescar() {
    setRefrescando(true);
    await refrescarUsuario();
    setRefrescando(false);
  }

  const rechazada = comunidad?.estado === "rechazada";

  return (
    <View style={styles.pantalla}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40 }]}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} />}
      >
        <View style={styles.logoFila}>
          <ZoomLogo variant="dark" iconSize={40} wordSize={28} />
        </View>

        {rechazada ? (
          <>
            <XCircle size={48} color={colors.danger} />
            <Text style={styles.titulo}>Solicitud rechazada</Text>
            <Text style={styles.texto}>
              La solicitud para crear la comunidad "{comunidad?.nombre}" no fue aprobada. Si creés que es un error,
              consultá con quien administra la app.
            </Text>
          </>
        ) : (
          <>
            <Clock size={48} color={colors.accentGold} />
            <Text style={styles.titulo}>Esperando aprobación</Text>
            <Text style={styles.texto}>
              Tu solicitud para crear la comunidad "{comunidad?.nombre}" está esperando que la aprueben. Ni bien se
              confirme vas a poder entrar y armar todo a tu gusto.
            </Text>
            <Text style={styles.hint}>Tirá hacia abajo para actualizar.</Text>
          </>
        )}

        <Pressable style={styles.salirBtn} onPress={signOut}>
          <LogOut size={16} color={colors.danger} />
          <Text style={styles.salirTexto}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 28, paddingBottom: 40, gap: 12 },
  logoFila: { marginBottom: 18 },
  titulo: { fontSize: 19, fontWeight: "800", color: colors.text, marginTop: 4, textAlign: "center" },
  texto: { fontSize: 13.5, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  hint: { fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  salirBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 28,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
  },
  salirTexto: { fontSize: 13, fontWeight: "700", color: colors.danger },
});

import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LogOut, Users } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { etiquetaRol, puedeGestionarEquipo } from "@/lib/roles";
import { ArbolLotes } from "@/features/lotes/arbol-lotes";
import { MisLotes } from "@/features/lotes/mis-lotes";
import { AppHeader } from "@/components/app-header";
import { colors } from "@/theme/colors";

export default function MisLotesScreen() {
  const { usuario, signOut } = useAuth();
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
          {puedeGestionarEquipo(usuario.rol) && (
            <Pressable style={styles.iconBtn} onPress={() => router.push("/(app)/equipo")}>
              <Users size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          <Pressable style={styles.iconBtn} onPress={signOut}>
            <LogOut size={19} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      {esAdministrador ? <ArbolLotes /> : <MisLotes />}
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
});

import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { etiquetaRol } from "@/lib/roles";
import { colors } from "@/theme/colors";

/** Placeholder de "Mis lotes" — acá va el árbol Cliente → Establecimiento →
 * Lote (administradores) o la lista de lotes con acceso (Monitoreador),
 * portado de MisLotesView/ArbolLotesView del prototipo. */
export default function MisLotesScreen() {
  const { usuario, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.saludo}>Hola, {usuario?.nombre}</Text>
        <Text style={styles.rol}>{usuario ? etiquetaRol(usuario.rol) : ""}</Text>
      </View>

      <Text style={styles.placeholder}>
        Acá va el árbol de Clientes → Establecimientos → Lotes (o la lista de lotes asignados, si sos
        Monitoreador) — próximo paso de la migración.
      </Text>

      <Pressable style={styles.salir} onPress={signOut}>
        <Text style={styles.salirTexto}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saludo: { fontSize: 18, fontWeight: "700", color: colors.text },
  rol: { fontSize: 13, color: colors.accentGold, fontWeight: "600", marginTop: 2 },
  placeholder: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  salir: { marginTop: "auto", alignSelf: "center", padding: 12 },
  salirTexto: { color: colors.danger, fontWeight: "600" },
});

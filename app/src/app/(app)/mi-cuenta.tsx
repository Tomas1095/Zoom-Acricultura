import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { LogOut, Trash2 } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { useEliminarCuenta } from "@/lib/usar-eliminar-cuenta";
import { etiquetaRol } from "@/lib/roles";
import { colors } from "@/theme/colors";

/** "Mi cuenta" — a pedido de Apple (App Review, Guideline 5.1.1(v)): la
 * app permite crear una cuenta (ver login.tsx, signUp), así que también
 * tiene que ofrecer eliminarla desde ADENTRO, no solo cerrar sesión. Esta
 * pantalla es el único lugar de la app con esa opción — a propósito
 * separada del botón de cerrar sesión de la pantalla principal (ver
 * app/(app)/index.tsx), para que borrar la cuenta necesite un paso
 * deliberado de más, no sea un botón a mano al lado de otros de uso
 * diario. La lógica de eliminar en sí está en usar-eliminar-cuenta.ts,
 * compartida con comunidad-pendiente.tsx (otra pantalla donde alguien
 * también podría necesitar borrarse). */
export default function MiCuentaScreen() {
  const { usuario, signOut } = useAuth();
  const { eliminando, pedirEliminarCuenta } = useEliminarCuenta();

  if (!usuario) return null;

  function pedirCerrarSesion() {
    Alert.alert("¿Cerrar sesión?", "Vas a tener que volver a ingresar con tu mail y contraseña.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.tarjeta}>
        <Text style={styles.nombre}>{usuario.nombre}</Text>
        <Text style={styles.mail}>{usuario.mail}</Text>
        <Text style={styles.rol}>{etiquetaRol(usuario.rol)}</Text>
      </View>

      <Pressable style={styles.opcion} onPress={pedirCerrarSesion}>
        <LogOut size={20} color={colors.text} />
        <Text style={styles.opcionTexto}>Cerrar sesión</Text>
      </Pressable>

      <Pressable style={[styles.opcion, styles.opcionPeligro]} onPress={pedirEliminarCuenta} disabled={eliminando}>
        {eliminando ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <>
            <Trash2 size={20} color={colors.danger} />
            <Text style={[styles.opcionTexto, styles.opcionTextoPeligro]}>Eliminar cuenta</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 24 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  nombre: { fontSize: 18, fontWeight: "700", color: colors.text },
  mail: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  rol: { fontSize: 12, color: colors.accentGold, fontWeight: "600", marginTop: 6 },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  opcionPeligro: { borderColor: colors.danger, backgroundColor: colors.dangerBg, marginTop: 8 },
  opcionTexto: { fontSize: 15, fontWeight: "600", color: colors.text },
  opcionTextoPeligro: { color: colors.danger },
});

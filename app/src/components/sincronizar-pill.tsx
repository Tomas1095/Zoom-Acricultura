import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { Check, RefreshCw } from "lucide-react-native";

import { useSync } from "@/lib/sync-context";
import { colors } from "@/theme/colors";

/** Estado de sincronización de la cola offline (ver lib/sync-context.tsx)
 * — antes vivía adentro de AppHeader (fondo oscuro), separada de la
 * pastilla de precarga (ver features/lotes/precarga-pill.tsx, fondo
 * claro) por el borde del header. A pedido del usuario: las dos deberían
 * verse juntas, una al lado de la otra, no cortadas por la mitad de la
 * pantalla — se movió acá, al cuerpo claro, mismo estilo que
 * PrecargaPill para que se vean como el mismo sistema. */
export function SincronizarPill() {
  const { pendientes, sincronizando, sincronizarAhora } = useSync();
  const listo = pendientes === 0 && !sincronizando;
  return (
    <Pressable
      style={[styles.pill, listo ? styles.pillListo : styles.pillPendiente]}
      onPress={sincronizarAhora}
      disabled={sincronizando}
    >
      {sincronizando ? (
        <ActivityIndicator color={colors.warning} size="small" />
      ) : pendientes > 0 ? (
        <RefreshCw size={12} color={colors.warning} />
      ) : (
        <Check size={12} color={colors.primaryDark} />
      )}
      <Text style={[styles.texto, listo ? styles.textoListo : styles.textoPendiente]}>
        {sincronizando
          ? "Sincronizando…"
          : pendientes > 0
            ? `${pendientes} ${pendientes === 1 ? "cambio" : "cambios"} sin subir — tocar para reintentar`
            : "Todo sincronizado — tocar para revisar"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillPendiente: { borderColor: colors.borderStrong, backgroundColor: colors.warningBg },
  pillListo: { borderColor: colors.border, backgroundColor: colors.successBg },
  texto: { fontSize: 11, fontWeight: "700", flexShrink: 1 },
  textoPendiente: { color: colors.warning },
  textoListo: { color: colors.primaryDark },
});

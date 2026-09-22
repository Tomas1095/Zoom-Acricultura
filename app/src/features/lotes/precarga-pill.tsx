import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { CheckCircle2 } from "lucide-react-native";

import { colors } from "@/theme/colors";

interface PrecargaPillProps {
  precargando: boolean;
  /** true una vez que terminó al menos una pasada completa de precarga en
   * esta sesión — se queda así aunque `precargando` vuelva a `true` en un
   * reintento posterior (ver el comentario más abajo). */
  lista: boolean;
  onPress: () => void;
}

/** Estado de la precarga de lotes para trabajar sin señal (ver
 * precargarLotes en lib/offline/cache-lote.ts) — pedido explícito del
 * usuario: antes esto pasaba en silencio de fondo, sin ninguna forma de
 * confirmar que ya terminó antes de salir a un lugar sin cobertura. Deja un
 * antes/después bien visible: "Descargando…" mientras corre, "Listo para
 * ir al campo" (se queda ahí, no desaparece) cuando termina — tocable para
 * forzar un reintento a mano, mismo patrón que la pastilla de sincronizar
 * del header (ver components/app-header.tsx). */
export function PrecargaPill({ precargando, lista, onPress }: PrecargaPillProps) {
  if (!precargando && !lista) return null;
  return (
    <Pressable
      style={[styles.pill, precargando ? styles.pillDescargando : styles.pillLista]}
      onPress={onPress}
      disabled={precargando}
    >
      {precargando ? (
        <ActivityIndicator color={colors.warning} size="small" />
      ) : (
        <CheckCircle2 size={13} color={colors.primaryDark} />
      )}
      <Text style={[styles.texto, precargando ? styles.textoDescargando : styles.textoLista]}>
        {precargando ? "Descargando lotes para trabajar sin señal…" : "Listo para ir al campo — tocar para revisar"}
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
  pillDescargando: { borderColor: colors.borderStrong, backgroundColor: colors.warningBg },
  pillLista: { borderColor: colors.border, backgroundColor: colors.successBg },
  texto: { fontSize: 11, fontWeight: "700" },
  textoDescargando: { color: colors.warning },
  textoLista: { color: colors.primaryDark },
});

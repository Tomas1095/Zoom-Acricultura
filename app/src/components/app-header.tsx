import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RefreshCw } from "lucide-react-native";

import { useSync } from "@/lib/sync-context";
import { ZoomLogo } from "./zoom-logo";

interface AppHeaderProps {
  /** Nombre del lote — portado de `{lote && <div style={loteName}>}` del
   * prototipo: cuando se pasa, aparece debajo de la línea naranja para
   * saber en qué lote estás parado (ver lote/[id]/index.tsx). */
  loteNombre?: string;
}

/** Header de la app — portado de `styles.header` del prototipo (fondo
 * verde oscuro, "MONITOREO DE PLAGAS" arriba, nombre de la comunidad, y el
 * logo a la derecha). Debajo de esto sigue el mismo layout que ya
 * teníamos (nombre del usuario, rol, accesos rápidos).
 *
 * La pantalla que use esto tiene que llevar `headerShown: false` en el
 * Stack — este componente reemplaza al header nativo, y por eso maneja el
 * margen del notch/status bar él mismo (con `useSafeAreaInsets`, no un
 * número fijo que se rompería en otro celular). */
export function AppHeader({ loteNombre }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { pendientes, sincronizando, sincronizarAhora } = useSync();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      <View>
        <Text style={styles.eyebrow}>MONITOREO DE PLAGAS</Text>
        <Text style={styles.titulo}>Zoom Agricultura</Text>
        <View style={styles.rule} />
        {loteNombre && <Text style={styles.loteNombre}>{loteNombre}</Text>}
        {pendientes > 0 && (
          <Pressable style={styles.pendientesPill} onPress={sincronizarAhora} disabled={sincronizando}>
            {sincronizando ? (
              <ActivityIndicator color="#F2A93B" size="small" />
            ) : (
              <RefreshCw size={12} color="#F2A93B" />
            )}
            <Text style={styles.pendientesTexto}>
              {sincronizando
                ? "Sincronizando…"
                : `${pendientes} ${pendientes === 1 ? "cambio" : "cambios"} sin subir — tocar para reintentar`}
            </Text>
          </Pressable>
        )}
      </View>
      <ZoomLogo variant="light" iconSize={32} wordSize={21} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#14231A",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 0.6,
    color: "#F2A93B",
    fontWeight: "700",
  },
  titulo: {
    fontSize: 21,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 6,
  },
  rule: {
    width: 32,
    height: 3,
    backgroundColor: "#DB945D",
    borderRadius: 2,
    marginTop: 8,
  },
  loteNombre: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 8,
  },
  pendientesPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(242,169,59,0.4)",
    backgroundColor: "rgba(242,169,59,0.12)",
  },
  pendientesTexto: { fontSize: 10.5, fontWeight: "700", color: "#F2A93B", flexShrink: 1 },
});

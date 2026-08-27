import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { AlertTriangle } from "lucide-react-native";

import { fetchConflictosDeLote, resolverConflictoCarga, type CargaEnConflicto } from "@/lib/db/cargas";
import { colors } from "@/theme/colors";

interface ConflictosBannerProps {
  loteId: string;
}

/** Cartel que ven Socio Fundador/Gerente al entrar a un lote si hay puntos
 * que dos personas cargaron sin señal — pedido explícito del usuario:
 * "les aparece un cartel qué tal o tales puntos están duplicados y el
 * gerente decide cuál quedarse y cuál eliminar". No se muestra a
 * Encargado ni Monitoreador — quien use este componente ya filtra por
 * `puedeResolverConflictos` antes de renderizarlo (ver lote/[id]/index.tsx). */
export function ConflictosBanner({ loteId }: ConflictosBannerProps) {
  const [conflictos, setConflictos] = useState<CargaEnConflicto[]>([]);
  const [eligiendo, setEligiendo] = useState<CargaEnConflicto | null>(null);
  const [resolviendo, setResolviendo] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      setConflictos(await fetchConflictosDeLote(loteId));
    } catch {
      // si falla no rompe la pantalla — el cartel simplemente no aparece,
      // se vuelve a intentar en el próximo focus
    }
  }, [loteId]);

  useFocusEffect(
    useCallback(() => {
      refrescar();
    }, [refrescar])
  );

  async function resolver(quedarseConNueva: boolean) {
    if (!eligiendo) return;
    setResolviendo(true);
    try {
      await resolverConflictoCarga(eligiendo.id, quedarseConNueva);
      setEligiendo(null);
      await refrescar();
    } catch (e: any) {
      // deja el modal abierto para reintentar — no perder la elección ya hecha
    } finally {
      setResolviendo(false);
    }
  }

  if (conflictos.length === 0) return null;

  return (
    <View style={styles.banner}>
      <AlertTriangle size={16} color={colors.warning} />
      <View style={styles.textos}>
        <Text style={styles.titulo}>
          {conflictos.length === 1
            ? "Hay 1 punto duplicado"
            : `Hay ${conflictos.length} puntos duplicados`}
        </Text>
        <Text style={styles.subtitulo}>Dos personas cargaron el mismo punto sin señal. Elegí cuál se queda.</Text>
        <View style={styles.lista}>
          {conflictos.map((c) => (
            <Pressable key={c.id} style={styles.item} onPress={() => setEligiendo(c)}>
              <Text style={styles.itemTexto}>
                Punto {c.linea}.{c.puntoNum}
              </Text>
              <Text style={styles.itemAccion}>Resolver</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Modal
        visible={eligiendo !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !resolviendo && setEligiendo(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            {eligiendo && (
              <>
                <Text style={styles.modalTitulo}>
                  Punto {eligiendo.linea}.{eligiendo.puntoNum} duplicado
                </Text>
                <Text style={styles.modalTexto}>
                  Este punto tiene una versión ya confirmada y una versión nueva que llegó después, cargada por
                  otra persona. Elegí cuál se queda — la otra se descarta.
                </Text>

                <View style={styles.comparacion}>
                  <View style={styles.comparacionCol}>
                    <Text style={styles.comparacionTitulo}>Versión guardada</Text>
                    <DetalleCarga bicho={undefined} babosa={undefined} observaciones={undefined} placeholder="(la que ya estaba confirmada)" />
                  </View>
                  <View style={styles.comparacionCol}>
                    <Text style={styles.comparacionTitulo}>Versión nueva</Text>
                    <DetalleCarga
                      bicho={eligiendo.bicho}
                      babosa={eligiendo.babosa}
                      observaciones={eligiendo.observaciones}
                    />
                  </View>
                </View>

                <View style={styles.botones}>
                  <Pressable
                    style={[styles.boton, styles.botonDescartar, resolviendo && styles.botonDeshabilitado]}
                    onPress={() => resolver(false)}
                    disabled={resolviendo}
                  >
                    {resolviendo ? (
                      <ActivityIndicator color={colors.primaryDark} size="small" />
                    ) : (
                      <Text style={styles.botonDescartarTexto}>Quedarme con la guardada</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.boton, styles.botonReemplazar, resolviendo && styles.botonDeshabilitado]}
                    onPress={() => resolver(true)}
                    disabled={resolviendo}
                  >
                    {resolviendo ? (
                      <ActivityIndicator color={colors.surface} size="small" />
                    ) : (
                      <Text style={styles.botonReemplazarTexto}>Usar la nueva</Text>
                    )}
                  </Pressable>
                </View>
                <Pressable disabled={resolviendo} onPress={() => setEligiendo(null)}>
                  <Text style={styles.cancelar}>Decidir después</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetalleCarga({
  bicho,
  babosa,
  observaciones,
  placeholder,
}: {
  bicho?: number;
  babosa?: number;
  observaciones?: string;
  placeholder?: string;
}) {
  if (placeholder) return <Text style={styles.detalleTexto}>{placeholder}</Text>;
  return (
    <>
      <Text style={styles.detalleTexto}>Bicho bolita: {bicho}</Text>
      <Text style={styles.detalleTexto}>Babosa: {babosa}</Text>
      {!!observaciones && <Text style={styles.detalleTexto}>Obs: {observaciones}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 12,
    padding: 12,
    width: "100%",
  },
  textos: { flex: 1, gap: 4 },
  titulo: { fontSize: 13, fontWeight: "700", color: colors.text },
  subtitulo: { fontSize: 12, color: colors.textMuted },
  lista: { gap: 6, marginTop: 4 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  itemTexto: { fontSize: 12, fontWeight: "600", color: colors.text },
  itemAccion: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  overlay: { flex: 1, backgroundColor: "rgba(27,46,31,0.45)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, gap: 12 },
  modalTitulo: { fontSize: 16, fontWeight: "700", color: colors.text },
  modalTexto: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  comparacion: { flexDirection: "row", gap: 12 },
  comparacionCol: {
    flex: 1,
    gap: 3,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
  },
  comparacionTitulo: { fontSize: 11, fontWeight: "700", color: colors.accentGold, textTransform: "uppercase" },
  detalleTexto: { fontSize: 12, color: colors.text },
  botones: { flexDirection: "row", gap: 10, marginTop: 4 },
  boton: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  botonDeshabilitado: { opacity: 0.5 },
  botonDescartar: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  botonDescartarTexto: { color: colors.primaryDark, fontWeight: "700", fontSize: 12 },
  botonReemplazar: { backgroundColor: colors.primaryConfirm },
  botonReemplazarTexto: { color: colors.surface, fontWeight: "700", fontSize: 12 },
  cancelar: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: 2 },
});

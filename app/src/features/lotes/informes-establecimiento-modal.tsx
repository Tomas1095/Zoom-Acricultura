import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FileText } from "lucide-react-native";

import { fetchInformesEstablecimiento, getInformeEstablecimientoUrl } from "@/lib/db/informes-establecimiento";
import type { InformeEstablecimiento } from "@/types/domain";
import { colors } from "@/theme/colors";

interface InformesEstablecimientoModalProps {
  establecimientoId: string;
  establecimientoNombre: string;
  onCerrar: () => void;
}

/** Historial de informes PDF guardados de un establecimiento — a pedido del
 * usuario, abierto desde el ícono de información al lado de cada
 * establecimiento en ArbolLotes. Agrupados por campaña (más reciente
 * primero) y, dentro de cada grupo, por nombre — tal como lo pidió:
 * "si se exportaron para la campaña 26/27 los lote 1 y lote 2, deberían
 * aparecer esos dos pdf y poder abrirlos rápido". No tiene borrado — a
 * diferencia de los archivos de cliente, el usuario no lo pidió acá. */
export function InformesEstablecimientoModal({
  establecimientoId,
  establecimientoNombre,
  onCerrar,
}: InformesEstablecimientoModalProps) {
  const [cargando, setCargando] = useState(true);
  const [informes, setInformes] = useState<InformeEstablecimiento[]>([]);
  const [abriendoId, setAbriendoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setInformes(await fetchInformesEstablecimiento(establecimientoId));
      } catch (e: any) {
        Alert.alert("No se pudieron cargar los informes", e.message ?? String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [establecimientoId]);

  // La query ya trae todo ordenado (campana desc, nombre_archivo asc) — acá
  // solo se arma en grupos para el título de cada campaña.
  const grupos = useMemo(() => {
    const porCampana = new Map<string, InformeEstablecimiento[]>();
    for (const informe of informes) {
      if (!porCampana.has(informe.campana)) porCampana.set(informe.campana, []);
      porCampana.get(informe.campana)!.push(informe);
    }
    return Array.from(porCampana.entries());
  }, [informes]);

  async function abrir(informe: InformeEstablecimiento) {
    setAbriendoId(informe.id);
    try {
      const url = await getInformeEstablecimientoUrl(informe.storagePath);
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert("No se pudo abrir el informe", e.message ?? String(e));
    } finally {
      setAbriendoId(null);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Informes de "{establecimientoNombre}"</Text>
          <Text style={styles.subtitulo}>Guardados desde "Exportar PDF y guardar en historial"</Text>

          {cargando ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : informes.length === 0 ? (
            <Text style={styles.vacio}>Todavía no se guardó ningún informe acá.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {grupos.map(([campana, items]) => (
                <View key={campana} style={styles.grupo}>
                  <Text style={styles.campanaTitulo}>Campaña {campana}</Text>
                  {items.map((informe) => (
                    <Pressable
                      key={informe.id}
                      style={styles.fila}
                      onPress={() => abrir(informe)}
                      disabled={abriendoId !== null}
                    >
                      {abriendoId === informe.id ? (
                        <ActivityIndicator size="small" color={colors.primaryDark} />
                      ) : (
                        <FileText size={16} color={colors.primaryDark} />
                      )}
                      <Text style={styles.nombreArchivo} numberOfLines={2}>
                        {informe.nombreArchivo}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable style={styles.cerrarBtn} onPress={onCerrar}>
            <Text style={styles.cerrarTexto}>Listo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(27,46,31,0.45)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 4 },
  titulo: { fontSize: 16, fontWeight: "700", color: colors.text },
  subtitulo: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  vacio: { color: colors.textMuted, textAlign: "center", paddingVertical: 20 },
  grupo: { marginBottom: 12 },
  campanaTitulo: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentGold,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nombreArchivo: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.text },
  cerrarBtn: { marginTop: 14, backgroundColor: colors.background, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cerrarTexto: { color: colors.text, fontWeight: "700" },
});

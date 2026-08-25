import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, Pencil } from "lucide-react-native";

import { getFotoUrl } from "@/lib/storage/fotos";
import type { Carga, Punto } from "@/types/domain";
import { colors } from "@/theme/colors";

interface ObservacionesPanelProps {
  puntos: Punto[];
  cargas: Map<string, Carga>;
}

/** Portado de la sección "Observaciones" de UbicacionView del prototipo —
 * un desplegable, al pie de la vista general, con los puntos donde algún
 * Monitoreador dejó un comentario o subió una foto. Solo lo ve quien puede
 * administrar el lote (mismo criterio que el prototipo: `role === "jefe" ||
 * role === "encargado"`), así que quién muestra este panel lo decide quien
 * lo usa, no este componente. */
export function ObservacionesPanel({ puntos, cargas }: ObservacionesPanelProps) {
  const [abierto, setAbierto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const puntosConInfo = useMemo(
    () =>
      puntos
        .map((p) => ({ punto: p, carga: cargas.get(p.id) }))
        .filter(
          (e): e is { punto: Punto; carga: Carga } =>
            !!e.carga && ((!!e.carga.observaciones && e.carga.observaciones.trim().length > 0) || e.carga.fotos.length > 0)
        )
        .sort((a, b) => a.punto.linea - b.punto.linea || a.punto.puntoNum - b.punto.puntoNum),
    [puntos, cargas]
  );

  // Pide las URLs firmadas de las fotos recién cuando se abre el panel (el
  // bucket es privado, no hace falta pedirlas si nadie las va a ver).
  useEffect(() => {
    if (!abierto) return;
    puntosConInfo.forEach(({ carga }) => {
      carga.fotos.forEach((path) => {
        if (urls[path]) return;
        getFotoUrl(path)
          .then((url) => setUrls((prev) => ({ ...prev, [path]: url })))
          .catch(() => {});
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo re-pedir al abrir o si cambian los puntos con info
  }, [abierto, puntosConInfo]);

  return (
    <View style={styles.container}>
      <Pressable style={styles.toggle} onPress={() => setAbierto((v) => !v)}>
        <Pencil size={14} color={colors.primaryDark} />
        <Text style={styles.toggleTexto}>Observaciones</Text>
        <ChevronDown
          size={15}
          color={colors.primaryDark}
          style={abierto ? styles.chevronAbierto : undefined}
        />
      </Pressable>

      {abierto && (
        <View style={styles.lista}>
          {puntosConInfo.length === 0 ? (
            <Text style={styles.vacio}>Sin observaciones</Text>
          ) : (
            puntosConInfo.map(({ punto, carga }) => (
              <View key={punto.id} style={styles.fila}>
                <Text style={styles.puntoTexto}>
                  Punto {punto.linea}.{punto.puntoNum}
                </Text>
                {carga.observaciones.trim().length > 0 && (
                  <Text style={styles.observacionTexto}>{carga.observaciones}</Text>
                )}
                {carga.fotos.length > 0 && (
                  <View style={styles.fotosFila}>
                    {carga.fotos.map(
                      (path) =>
                        urls[path] && (
                          <Pressable key={path} onPress={() => setFotoAmpliada(urls[path])}>
                            <Image source={{ uri: urls[path] }} style={styles.fotoThumb} />
                          </Pressable>
                        )
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      <Modal visible={!!fotoAmpliada} transparent animationType="fade" onRequestClose={() => setFotoAmpliada(null)}>
        <Pressable style={styles.modalFondo} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada && <Image source={{ uri: fotoAmpliada }} style={styles.fotoAmpliada} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  toggleTexto: { flex: 1, color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
  chevronAbierto: { transform: [{ rotate: "180deg" }] },
  lista: {
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
    gap: 12,
  },
  vacio: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 4 },
  fila: { gap: 4 },
  puntoTexto: { fontSize: 13, fontWeight: "700", color: colors.text },
  observacionTexto: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  fotosFila: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  fotoThumb: { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" },
  fotoAmpliada: { width: "100%", height: "80%" },
});

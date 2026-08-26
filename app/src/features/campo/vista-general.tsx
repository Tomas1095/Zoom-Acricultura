import { useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Maximize2, RotateCcw } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes } from "@/lib/roles";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { useDatosCampo } from "./usar-datos-campo";
import { MapaCampo, type MapaCampoHandle, type PuntoMapa } from "./mapa-campo";
import { ObservacionesPanel } from "./observaciones-panel";
import { CerrarCampanaBoton } from "./cerrar-campana-boton";

const FIT_ALTO = 460;

interface VistaGeneralProps {
  lote: Lote;
  /** Qué campaña mirar — default la vigente. La pasa LoteTabs cuando hay
   * selector de historial (ver CampanaSelector); el Monitoreador, que usa
   * este componente directo sin pestañas, nunca la pasa. */
  campanaViendo?: string;
  /** Solo true cuando LoteTabs decide que este usuario puede cerrar
   * campañas (ver puedeCerrarCampana en roles.ts) — acá no se vuelve a
   * chequear el rol, LoteTabs ya filtra quién llega con esto en true. */
  puedeMostrarCerrarCampana?: boolean;
  /** Avisa que se cerró la campaña — quien lo use tiene que refrescar el
   * lote (cambió `campanaActual`) y volver a la nueva campaña vigente. */
  onCampanaCerrada?: () => void;
}

/** Vista general del lote — portado de UbicacionView del prototipo en su
 * modo "mapa fijo" (no pantalla completa). El Monitoreador puede ubicarse
 * acá pero solo carga datos desde Modo trabajo (ver CONTEXTO.md).
 *
 * "Info" y "Cómo llegar" quedaron en la lista de "Mis lotes" (un nivel
 * arriba), no acá adentro — así el lote es solo mapa + acción de trabajar. */
export function VistaGeneral({ lote, campanaViendo, puedeMostrarCerrarCampana, onCampanaCerrada }: VistaGeneralProps) {
  const { usuario } = useAuth();
  const campanaEfectiva = campanaViendo ?? lote.campanaActual;
  const viendoActual = campanaEfectiva === lote.campanaActual;
  const { cargando, puntos, cargas, gps, puntoCercano, enRango } = useDatosCampo(lote.id, campanaEfectiva);
  const { width } = useWindowDimensions();
  const mapaRef = useRef<MapaCampoHandle>(null);
  const [vistaModificada, setVistaModificada] = useState(false);

  const puntosMapa: PuntoMapa[] = useMemo(
    () =>
      puntos.map((p) => ({
        id: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        confirmado: cargas.get(p.id)?.confirmado ?? false,
      })),
    [puntos, cargas]
  );

  // Mirando una campaña archivada, nadie carga datos nuevos ahí — ni el
  // Monitoreador ni nadie más, es historial de solo lectura.
  const puedeTocarPuntos = usuario?.rol !== "monitoreador" && viendoActual;
  const puedeVerObservaciones = !!usuario && puedeAdministrarLotes(usuario.rol);
  const anchoMapa = Math.min(width - 32, 400);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.accionesFila}>
        {vistaModificada && (
          <Pressable
            style={styles.botonRestablecer}
            onPress={() => {
              mapaRef.current?.restablecer();
              setVistaModificada(false);
            }}
          >
            <RotateCcw size={13} color={colors.primaryDark} />
            <Text style={styles.botonRestablecerTexto}>Restablecer</Text>
          </Pressable>
        )}
        {viendoActual && (
          <Pressable
            style={styles.botonModoTrabajo}
            onPress={() => router.push(`/(app)/lote/${lote.id}/modo-trabajo`)}
          >
            <Maximize2 size={14} color={colors.surface} />
            <Text style={styles.botonModoTrabajoTexto}>Modo trabajo</Text>
          </Pressable>
        )}
      </View>

      <MapaCampo
        ref={mapaRef}
        puntos={puntosMapa}
        perimetro={lote.perimetro}
        miPos={gps.posicion}
        puntoCercanoId={puntoCercano ? `${puntoCercano.punto.linea}.${puntoCercano.punto.puntoNum}` : null}
        enRango={enRango}
        heading={gps.heading}
        pantallaCompleta={false}
        puedeTocarPuntos={puedeTocarPuntos}
        onTapPunto={(id) => router.push(`/(app)/lote/${lote.id}/punto/${id}`)}
        ancho={anchoMapa}
        alto={FIT_ALTO}
        onInteraccion={setVistaModificada}
      />

      {!puedeTocarPuntos && viendoActual && (
        <Text style={styles.aviso}>
          Esta vista es solo para ubicarte. Para cargar datos, entrá a "Modo trabajo".
        </Text>
      )}

      {puedeVerObservaciones && <ObservacionesPanel puntos={puntos} cargas={cargas} />}

      {puedeMostrarCerrarCampana && viendoActual && onCampanaCerrada && (
        <CerrarCampanaBoton lote={lote} puntos={puntos} cargas={cargas} onCerrado={onCampanaCerrada} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12, alignItems: "center" },
  accionesFila: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, width: "100%" },
  botonRestablecer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  botonRestablecerTexto: { color: colors.primaryDark, fontWeight: "700", fontSize: 11 },
  botonModoTrabajo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botonModoTrabajoTexto: { color: colors.surface, fontWeight: "700", fontSize: 12 },
  aviso: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
});

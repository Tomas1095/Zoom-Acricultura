import { useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Download, Maximize2, RotateCcw } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes } from "@/lib/roles";
import { exportarPuntos } from "@/lib/exportar/puntos";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { PromptModal } from "@/components/prompt-modal";
import { useDatosCampo } from "./usar-datos-campo";
import { useMiRuta } from "./usar-mi-ruta";
import { MapaCampo, type MapaCampoHandle, type PuntoMapa } from "./mapa-campo";
import { ObservacionesPanel } from "./observaciones-panel";
import { CerrarCampanaBoton } from "./cerrar-campana-boton";
import { MiRutaControles } from "./mi-ruta-controles";

const FIT_ALTO = 460;

interface VistaGeneralProps {
  lote: Lote;
  establecimientoNombre?: string;
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
export function VistaGeneral({
  lote,
  establecimientoNombre,
  campanaViendo,
  puedeMostrarCerrarCampana,
  onCampanaCerrada,
}: VistaGeneralProps) {
  const { usuario } = useAuth();
  const campanaEfectiva = campanaViendo ?? lote.campanaActual;
  const viendoActual = campanaEfectiva === lote.campanaActual;
  // El Monitoreador ve SU propio avance ("lo que hice yo"); Socio Gerente/
  // Fundador/Encargado ven el total del lote — pedido explícito del
  // usuario, ver lib/offline/resumen.ts.
  const esMonitoreador = usuario?.rol === "monitoreador";
  const { cargando, usandoCache, puntos, cargas, resumen, gps, puntoCercano, enRango, origen } = useDatosCampo(
    lote.id,
    campanaEfectiva,
    esMonitoreador ? usuario?.id : undefined
  );
  const { width } = useWindowDimensions();
  const mapaRef = useRef<MapaCampoHandle>(null);
  const [vistaModificada, setVistaModificada] = useState(false);
  const miRutaHook = useMiRuta(lote.id, usuario?.id);
  const [formatoAExportar, setFormatoAExportar] = useState<"gpx" | "kml" | null>(null);
  const [exportandoGrilla, setExportandoGrilla] = useState(false);

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
  const puedeExportarGrilla = !!usuario && puedeAdministrarLotes(usuario.rol);
  const anchoMapa = Math.min(width - 32, 400);

  const nombreGrillaDefault = `Puntos ${lote.nombre}${establecimientoNombre ? " " + establecimientoNombre : ""}`;

  async function confirmarExportarGrilla(valores: Record<string, string>) {
    const formato = formatoAExportar;
    if (!formato || !origen) {
      setFormatoAExportar(null);
      return;
    }
    setExportandoGrilla(true);
    try {
      await exportarPuntos(
        puntos.map((p) => ({ id: `${p.linea}.${p.puntoNum}`, x: p.x, y: p.y })),
        origen,
        formato,
        valores.nombre
      );
    } catch (e: any) {
      Alert.alert(`No se pudo exportar el ${formato.toUpperCase()}`, e.message ?? String(e));
    } finally {
      setExportandoGrilla(false);
      setFormatoAExportar(null);
    }
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {usandoCache && (
        <Text style={styles.avisoCache}>
          📡 Sin señal — mostrando la última versión guardada en este celular, puede no estar al día.
        </Text>
      )}

      {viendoActual && puntos.length > 0 && (esMonitoreador ? resumen.completados > 0 : true) && (
        <Text style={styles.resumenAvance}>
          {esMonitoreador
            ? `${resumen.completados} puntos completados`
            : `${resumen.completados}/${resumen.totalPuntos} completados`}
          {resumen.completados > 0 && ` · ${resumen.sincronizados}/${resumen.completados} sincronizados`}
        </Text>
      )}

      <View style={styles.accionesFila}>
        {puedeExportarGrilla && puntos.length > 0 && (
          <View style={styles.exportarGrillaFila}>
            <Text style={styles.exportarGrillaTexto}>Exportar grilla:</Text>
            <Pressable style={styles.botonExportarGrilla} onPress={() => setFormatoAExportar("kml")}>
              <Download size={12} color={colors.primaryDark} />
              <Text style={styles.botonExportarGrillaTexto}>KML</Text>
            </Pressable>
            <Pressable style={styles.botonExportarGrilla} onPress={() => setFormatoAExportar("gpx")}>
              <Download size={12} color={colors.primaryDark} />
              <Text style={styles.botonExportarGrillaTexto}>GPX</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.accionesFilaDerecha}>
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
      </View>

      <PromptModal
        visible={formatoAExportar !== null}
        titulo={`Exportar grilla (${formatoAExportar?.toUpperCase()})`}
        fields={[{ key: "nombre", label: "Nombre del archivo", valorInicial: nombreGrillaDefault }]}
        textoConfirmar="Exportar"
        confirmando={exportandoGrilla}
        onCancelar={() => setFormatoAExportar(null)}
        onConfirmar={confirmarExportarGrilla}
      />

      {viendoActual && (
        <MiRutaControles
          miRuta={miRutaHook.miRuta}
          rutaConfirmada={miRutaHook.rutaConfirmada}
          modoMarcarRuta={miRutaHook.modoMarcarRuta}
          pidiendoEditar={miRutaHook.pidiendoEditar}
          onEmpezarAMarcar={miRutaHook.empezarAMarcar}
          onTerminarDeMarcar={miRutaHook.terminarDeMarcar}
          onPedirEditar={() => miRutaHook.setPidiendoEditar(true)}
          onConfirmarEditar={() => {
            miRutaHook.setPidiendoEditar(false);
            miRutaHook.empezarAMarcar();
          }}
          onCancelarEditar={() => miRutaHook.setPidiendoEditar(false)}
          onBorrarTodo={miRutaHook.borrarTodo}
        />
      )}

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
        miRuta={viendoActual ? miRutaHook.miRuta : undefined}
        modoMarcarRuta={viendoActual && miRutaHook.modoMarcarRuta}
        onTogglePuntoRuta={miRutaHook.alternarPunto}
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
  resumenAvance: { fontSize: 13, fontWeight: "700", color: colors.primaryDark, alignSelf: "flex-start" },
  avisoCache: {
    fontSize: 11.5,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: "600",
  },
  accionesFila: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  accionesFilaDerecha: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" },
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
  exportarGrillaFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  exportarGrillaTexto: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  botonExportarGrilla: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonExportarGrillaTexto: { color: colors.primaryDark, fontWeight: "700", fontSize: 11 },
});

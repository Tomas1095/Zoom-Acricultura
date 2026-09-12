import { useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { ChevronDown, Download, FileSpreadsheet, Maximize2, RotateCcw } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes } from "@/lib/roles";
import { exportarPuntos } from "@/lib/exportar/puntos";
import { exportarShapefileLotePoligono } from "@/lib/exportar/shapefile";
import { nombreLoteYEstablecimiento } from "@/lib/exportar/nombres";
import { elegirArchivoExcel, exportarPlantillaExcel, parsearPlanillaExcel } from "@/lib/planilla/planilla-monitoreo";
import { eliminarCargas, importarCargas } from "@/lib/db/cargas";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { PromptModal } from "@/components/prompt-modal";
import type { ResumenAvanceLote } from "@/lib/offline/resumen";
import { useDatosCampo } from "./usar-datos-campo";
import { useMiRuta } from "./usar-mi-ruta";
import { MapaCampo, type MapaCampoHandle, type PuntoMapa } from "./mapa-campo";
import { ObservacionesPanel } from "./observaciones-panel";
import { CerrarCampanaBoton } from "./cerrar-campana-boton";
import { MiRutaControles } from "./mi-ruta-controles";

const FIT_ALTO = 460;

const NOMBRE_FORMATO: Record<"kml" | "gpx" | "shp", string> = { kml: "KML", gpx: "GPX", shp: "Shapefile" };

/** Verde SOLO cuando está todo: para un Socio/Encargado eso es "toda la
 * grilla completada y todo lo completado ya sincronizado"; para un
 * Monitoreador (sin un total fijo — ver useDatosCampo) alcanza con que lo
 * que hizo ya haya sincronizado del todo. Cualquier fracción de por medio
 * es naranja/alerta — pedido explícito del usuario. */
function resumenCompleto(resumen: ResumenAvanceLote, esMonitoreador: boolean): boolean {
  if (resumen.sincronizados !== resumen.completados) return false;
  return esMonitoreador || resumen.completados === resumen.totalPuntos;
}

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
  const { cargando, usandoCache, puntos, cargas, resumen, gps, puntoCercano, enRango, origen, refrescar } = useDatosCampo(
    lote.id,
    campanaEfectiva,
    esMonitoreador ? usuario?.id : undefined
  );
  const { width } = useWindowDimensions();
  const mapaRef = useRef<MapaCampoHandle>(null);
  const [vistaModificada, setVistaModificada] = useState(false);
  const miRutaHook = useMiRuta(lote.id, usuario?.id);
  const [formatoAExportar, setFormatoAExportar] = useState<"gpx" | "kml" | "shp" | null>(null);
  const [exportandoGrilla, setExportandoGrilla] = useState(false);
  // Un solo botón "Exportar grilla" que despliega los 3 formatos, en vez de
  // un botón por formato (con Shapefile ya son 3 — pedido explícito del
  // usuario para no cargar de más la vista principal). `menuPos` guarda
  // dónde poner el desplegable (ver abrirMenuExportar, más abajo) — null
  // significa cerrado.
  const botonExportarRef = useRef<View>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Planilla Excel — a pedido del usuario, para cargar datos tomados en
  // papel mientras todavía no se podía usar la app a campo (ver
  // lib/planilla/planilla-monitoreo.ts). Mismo patrón de desplegable que
  // "Exportar grilla" de arriba, pero con su propio estado — son menús
  // independientes.
  const botonPlanillaRef = useRef<View>(null);
  const [menuPlanillaPos, setMenuPlanillaPos] = useState<{ top: number; left: number } | null>(null);
  const [procesandoPlanilla, setProcesandoPlanilla] = useState(false);

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

  const nombreGrillaDefault = `Puntos ${nombreLoteYEstablecimiento(lote.nombre, establecimientoNombre)}`;

  // Mide dónde está el botón en la pantalla (no en el contenido del
  // ScrollView, que se puede haber desplazado) para poner el desplegable
  // justo debajo — el desplegable en sí va en un <Modal>, así queda por
  // encima de todo lo demás sin que el ScrollView le recorte el contenido.
  function abrirMenuExportar() {
    botonExportarRef.current?.measureInWindow((x, y, _width, height) => {
      setMenuPos({ top: y + height + 4, left: x });
    });
  }

  function elegirFormatoExportar(formato: "kml" | "gpx" | "shp") {
    setMenuPos(null);
    setFormatoAExportar(formato);
  }

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
      // Shapefile del polígono del lote, automático — a pedido del
      // usuario: además de los puntos, un segundo .zip (aparte, para
      // abrirlo por separado en QGIS/ArcGIS) con el límite real del lote,
      // nombrado "Lote Establecimiento" (sin el "Puntos" adelante, y sin
      // depender de si la persona cambió el nombre del archivo de puntos
      // en el modal). Solo tiene sentido para Shapefile — GPX/KML de
      // puntos no llevan un segundo archivo. `Sharing.shareAsync` (ver
      // guardarYCompartirBinario) muestra la hoja de compartir del
      // primero, y recién cuando esa se cierra se dispara la del segundo
      // — dos archivos separados, uno atrás del otro, no uno mezclado con
      // el otro.
      if (formato === "shp") {
        const nombrePoligono = nombreLoteYEstablecimiento(lote.nombre, establecimientoNombre);
        await exportarShapefileLotePoligono(lote.perimetro, origen, nombrePoligono);
      }
    } catch (e: any) {
      Alert.alert(`No se pudo exportar el ${formato.toUpperCase()}`, e.message ?? String(e));
    } finally {
      setExportandoGrilla(false);
      setFormatoAExportar(null);
    }
  }

  function abrirMenuPlanilla() {
    botonPlanillaRef.current?.measureInWindow((x, y, _width, height) => {
      setMenuPlanillaPos({ top: y + height + 4, left: x });
    });
  }

  // En "Exportar grilla" (arriba) cerrar el desplegable siempre da paso a
  // OTRO modal propio (pedir el nombre del archivo) antes de compartir de
  // verdad, así que para cuando se llega a la hoja nativa el desplegable
  // ya terminó de cerrarse hace rato. Acá no hay ningún paso intermedio:
  // se pasa directo del desplegable a un picker/hoja de compartir nativo
  // de iOS — y presentarlo mientras el <Modal> del desplegable todavía se
  // está cerrando (la animación tarda un rato) hace que iOS lo ignore en
  // silencio: ni error, ni cartel, el ícono se queda girando para
  // siempre. Es un problema conocido de RN/Expo en iOS (ver expo/expo#21418,
  // #35835, #43774) — el margen de espera evita la carrera.
  const ESPERA_CIERRE_MODAL_MS = 350;

  async function descargarPlanilla() {
    setMenuPlanillaPos(null);
    setProcesandoPlanilla(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, ESPERA_CIERRE_MODAL_MS));
      await exportarPlantillaExcel(
        puntos.map((p) => ({ linea: p.linea, puntoNum: p.puntoNum })),
        nombreLoteYEstablecimiento(lote.nombre, establecimientoNombre)
      );
    } catch (e: any) {
      Alert.alert("No se pudo descargar la planilla", e.message ?? String(e));
    } finally {
      setProcesandoPlanilla(false);
    }
  }

  // Sube la planilla ya completada, la matchea contra los puntos reales
  // del lote y carga cada fila válida — mismo resultado que cargar cada
  // punto a mano y confirmarlo (queda en verde). Errores puntuales (un
  // punto que no existe, un número mal escrito) no cortan todo el import,
  // se juntan y se muestran al final (ver parsearPlanillaExcel).
  async function subirPlanilla() {
    setMenuPlanillaPos(null);
    await new Promise((resolve) => setTimeout(resolve, ESPERA_CIERRE_MODAL_MS));
    const archivo = await elegirArchivoExcel();
    if (!archivo || !usuario) return;

    // A pedido del usuario: la planilla que se sube manda para el lote
    // entero, no solo para los puntos que trae completos — un punto sin
    // datos en la planilla queda sin datos en la app, tenga o no una
    // carga previa. Como eso puede borrar una carga real si se subió la
    // planilla que no era, si el lote ya tiene algo cargado se pide
    // confirmación antes de tocar nada — un aviso simple acá (no hace
    // falta abrir el archivo todavía para saber si HAY algo cargado, ver
    // `resumen.completados`); el resumen final, más abajo, ya cuenta en
    // números cuántos puntos quedaron sin datos con esta subida puntual.
    if (resumen.completados > 0) {
      const avanzar = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Estás por sobrescribir datos",
          "Este lote ya tiene puntos cargados. La planilla que subas ahora manda: los puntos que traiga completos se actualizan, y los que no traiga quedan SIN datos (se borra lo que tuvieran antes).\n\n¿Avanzamos?",
          [
            { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
            { text: "Avanzamos", onPress: () => resolve(true) },
          ]
        );
      });
      if (!avanzar) return;
    }

    setProcesandoPlanilla(true);
    try {
      const { filas, errores, puntosSinDato } = await parsearPlanillaExcel(
        archivo,
        puntos.map((p) => ({ id: p.id, linea: p.linea, puntoNum: p.puntoNum }))
      );

      await importarCargas(filas, campanaEfectiva, usuario.id);
      await eliminarCargas(puntosSinDato, campanaEfectiva);
      await refrescar();

      const resumenTexto =
        `Se cargaron ${filas.length} punto${filas.length === 1 ? "" : "s"}.` +
        (puntosSinDato.length > 0 ? ` ${puntosSinDato.length} quedaron sin datos.` : "");
      if (errores.length > 0) {
        const detalle = errores.slice(0, 10).join("\n") + (errores.length > 10 ? `\n… y ${errores.length - 10} más.` : "");
        Alert.alert("Planilla importada, con avisos", `${resumenTexto}\n\n${detalle}`);
      } else {
        Alert.alert("Listo", resumenTexto);
      }
    } catch (e: any) {
      Alert.alert("No se pudo importar la planilla", e.message ?? String(e));
    } finally {
      setProcesandoPlanilla(false);
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
        <Text
          style={[styles.resumenAvance, resumenCompleto(resumen, esMonitoreador) ? styles.resumenAvanceOk : styles.resumenAvanceAlerta]}
          numberOfLines={1}
        >
          {esMonitoreador
            ? `${resumen.completados} puntos completados`
            : `${resumen.completados}/${resumen.totalPuntos} completados`}
          {resumen.completados > 0 && ` · ${resumen.sincronizados}/${resumen.completados} sincronizados`}
        </Text>
      )}

      <View style={styles.accionesFila}>
        {puedeExportarGrilla && puntos.length > 0 && (
          <Pressable ref={botonExportarRef} style={styles.botonExportarGrilla} onPress={abrirMenuExportar}>
            <Download size={12} color={colors.primaryDark} />
            <Text style={styles.botonExportarGrillaTexto}>Exportar grilla</Text>
            <ChevronDown size={12} color={colors.primaryDark} />
          </Pressable>
        )}
        {/* Planilla Excel — a pedido del usuario, mientras la carga a
            campo desde el celular todavía no se podía usar: bajar una
            planilla con los puntos del lote ya listados, completarla en
            la compu y volver a subirla para cargar todo de una. Solo
            tiene sentido en la campaña vigente (no se carga sobre
            historial archivado). */}
        {puedeExportarGrilla && puntos.length > 0 && viendoActual && (
          <Pressable
            ref={botonPlanillaRef}
            style={styles.botonExportarGrilla}
            onPress={abrirMenuPlanilla}
            disabled={procesandoPlanilla}
          >
            {procesandoPlanilla ? (
              <ActivityIndicator size="small" color={colors.primaryDark} />
            ) : (
              <FileSpreadsheet size={12} color={colors.primaryDark} />
            )}
            <Text style={styles.botonExportarGrillaTexto}>Planilla</Text>
            <ChevronDown size={12} color={colors.primaryDark} />
          </Pressable>
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

      <Modal visible={menuPos !== null} transparent animationType="fade" onRequestClose={() => setMenuPos(null)}>
        <Pressable style={styles.menuExportarBackdrop} onPress={() => setMenuPos(null)}>
          <View style={[styles.menuExportar, menuPos ? { top: menuPos.top, left: menuPos.left } : null]}>
            <Pressable style={styles.menuExportarItem} onPress={() => elegirFormatoExportar("kml")}>
              <Text style={styles.menuExportarItemTexto}>KML</Text>
            </Pressable>
            <Pressable style={styles.menuExportarItem} onPress={() => elegirFormatoExportar("gpx")}>
              <Text style={styles.menuExportarItemTexto}>GPX</Text>
            </Pressable>
            <Pressable style={styles.menuExportarItem} onPress={() => elegirFormatoExportar("shp")}>
              <Text style={styles.menuExportarItemTexto}>Shapefile</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={menuPlanillaPos !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuPlanillaPos(null)}
      >
        <Pressable style={styles.menuExportarBackdrop} onPress={() => setMenuPlanillaPos(null)}>
          <View style={[styles.menuExportar, menuPlanillaPos ? { top: menuPlanillaPos.top, left: menuPlanillaPos.left } : null]}>
            <Pressable style={styles.menuExportarItem} onPress={descargarPlanilla}>
              <Text style={styles.menuExportarItemTexto}>Descargar planilla</Text>
            </Pressable>
            <Pressable style={styles.menuExportarItem} onPress={subirPlanilla}>
              <Text style={styles.menuExportarItemTexto}>Subir planilla completa</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <PromptModal
        visible={formatoAExportar !== null}
        titulo={`Exportar grilla (${NOMBRE_FORMATO[formatoAExportar ?? "kml"]})`}
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
  resumenAvance: { fontSize: 13, fontWeight: "700", alignSelf: "flex-start" },
  resumenAvanceOk: { color: colors.primaryDark },
  resumenAvanceAlerta: { color: colors.warning },
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
  // El backdrop cubre toda la pantalla (para poder cerrar el desplegable
  // tocando afuera) pero es invisible — no hace falta oscurecer nada para
  // un menú tan chico. El menú en sí se posiciona a mano con `menuPos` (ver
  // abrirMenuExportar), calculado desde dónde está el botón en pantalla.
  menuExportarBackdrop: { flex: 1 },
  menuExportar: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    minWidth: 140,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  menuExportarItem: { paddingHorizontal: 14, paddingVertical: 10 },
  menuExportarItemTexto: { color: colors.text, fontWeight: "600", fontSize: 13 },
});

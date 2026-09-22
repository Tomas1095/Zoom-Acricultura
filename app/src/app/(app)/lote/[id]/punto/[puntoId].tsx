import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, Lock, MapPin, Pencil, X } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { fetchLote } from "@/lib/db/lotes";
import { fetchPunto } from "@/lib/db/puntos";
import { fetchCarga, guardarYConfirmarCarga, reabrirCarga, agregarFotoACarga, quitarFotoDeCarga } from "@/lib/db/cargas";
import { fetchUsuarioPorId } from "@/lib/db/equipo";
import { subirFoto, getFotoUrl, eliminarFoto } from "@/lib/storage/fotos";
import { agregarCambioPendiente } from "@/lib/offline/cola";
import { leerCacheLote } from "@/lib/offline/cache-lote";
import { conTimeout, hayConexion } from "@/lib/offline/net";
import { fusionarPendientesEnCargas } from "@/lib/offline/resumen";
import { useSync } from "@/lib/sync-context";
import { puedeAdministrarLotes } from "@/lib/roles";
import type { Carga, Lote, Punto, Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";
import { NumberField, YesNoField } from "@/features/campo/campos-carga";

interface FormCarga {
  bicho: number;
  babosa: number;
  huevoBabosas: boolean;
  gusanoArroz: boolean;
  isocaCortadora: boolean;
  gusanoBlanco: boolean;
  observaciones: string;
}

// Altura fija de la barra "Listo" flotante (ver styles.barraFlotante — la
// altura está fijada por style, no depende del contenido, para que este
// número sea siempre exacto) y un margen extra de respiro.
const ALTURA_BARRA = 48;
const MARGEN = 12;
// Colchón chico entre la barra y el teclado: el alto que reporta el evento
// de teclado en iOS a veces no incluye del todo la barra de sugerencias de
// texto, así que sin este margen la barra quedaba parcialmente tapada por
// el borde del teclado.
const MARGEN_TECLADO = 20;

const FORM_VACIO: FormCarga = {
  bicho: 0,
  babosa: 0,
  huevoBabosas: false,
  gusanoArroz: false,
  isocaCortadora: false,
  gusanoBlanco: false,
  observaciones: "",
};

/** Carga de datos de un punto — portado de PointSheet del prototipo. Los
 * campos se editan en memoria y se guardan todos juntos al confirmar (no
 * escritura por tecla, ver comentario en guardarYConfirmarCarga); las fotos
 * sí se suben al toque porque son una acción puntual, no texto en curso. */
export default function PuntoScreen() {
  const { id: loteId, puntoId: etiqueta } = useLocalSearchParams<{ id: string; puntoId: string }>();
  const { usuario } = useAuth();
  const { avisarCambioEncolado } = useSync();

  const [cargando, setCargando] = useState(true);
  const [usandoCache, setUsandoCache] = useState(false);
  const [lote, setLote] = useState<Lote | null>(null);
  const [punto, setPunto] = useState<Punto | null>(null);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [usuarioQueCargo, setUsuarioQueCargo] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormCarga>(FORM_VACIO);
  const [mostrarObservaciones, setMostrarObservaciones] = useState(false);
  const [confirmoReapertura, setConfirmoReapertura] = useState(false);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  const observacionesRef = useRef<TextInput>(null);
  const bichoRef = useRef<TextInput>(null);
  const babosaRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Espejo de alturaTeclado en un ref: enfocarCampo se dispara con un
  // pequeño delay (para esperar la animación del teclado) y para ese
  // entonces necesita el valor más nuevo, no el que tenía la pantalla
  // renderizada en el momento del focus — un state normal ahí quedaría
  // desactualizado.
  const alturaTecladoRef = useRef(0);
  const altoScrollRef = useRef(0);
  const scrollYRef = useRef(0);
  // Ver el useEffect de keyboardWillHide/keyboardDidHide más abajo: el
  // colapso del layout se demora hasta que el teclado termina de
  // esconderse DE VERDAD, pero con un toque sostenido (el dedo apoyado más
  // tiempo antes de levantarlo) esa demora puede cumplirse mientras el
  // dedo TODAVÍA sigue apoyado — el mismo problema de nuevo, no evitado,
  // solo corrido en el tiempo. `dedoEnListoRef` dice si el dedo sigue
  // sobre el botón; `colapsoPendienteRef` dice si el timer ya se cumplió
  // pero tuvo que esperar porque el dedo seguía ahí — en ese caso el
  // colapso se hace recién cuando el dedo se levanta de verdad (ver
  // onTouchEnd/onResponderRelease en la barra "Listo").
  const dedoEnListoRef = useRef(false);
  const colapsoPendienteRef = useRef(false);

  // InputAccessoryView resultó poco confiable acá: con dos o más campos
  // apuntando al mismo nativeID, solo el primero que se enfocaba mostraba
  // la barra "Listo" — los siguientes se quedaban sin ella (bug conocido
  // de iOS/Fabric con accesorios compartidos entre inputs). En vez de
  // pelear con eso, la barra "Listo" acá es una vista propia, posicionada
  // a mano justo arriba del teclado usando su altura real — funciona
  // igual para cualquier campo de texto de la pantalla (número u
  // observaciones) sin depender de esa API.
  useEffect(() => {
    const mostrar = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const ocultar = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    // Reportado por el usuario, reproducible siempre: tocando "Listo" el
    // teclado baja y sube solo al instante, como un flash — la única forma
    // de cerrarlo de verdad era tocar dos veces afuera, en un lugar en
    // blanco. La barra "Listo" ya tenía tres disparadores de toque
    // redundantes (ver más abajo) para que el TOQUE en sí nunca se
    // perdiera — y no se pierde: el problema no es que "Listo" falle en
    // registrar el toque, es que UN SEGUNDO toque se genera solo, sobre
    // OTRA cosa.
    //
    // La sospecha (consistente con que sea reproducible SIEMPRE, no
    // intermitente): los disparadores de la barra "Listo" están en
    // onTouchStart/onResponderGrant — se disputan apenas el dedo TOCA la
    // pantalla, antes de levantarlo. Ese toque llama a Keyboard.dismiss(),
    // que dispara este mismo listener (keyboardWillHide) EN EL MISMO
    // INSTANTE en que arranca la animación nativa del teclado — o sea,
    // mientras el dedo todavía está apoyado. Hasta acá, `alturaTeclado`
    // pasaba a 0 en ese momento, y esta pantalla reacciona a eso corriendo
    // la barra "Listo" fuera de pantalla Y sacándole el padding extra al
    // ScrollView — un cambio de layout real, debajo del dedo, ANTES de que
    // el dedo se levante. En iOS, si lo que hay debajo de un dedo apoyado
    // cambia de golpe, el sistema puede terminar entregando el toque (al
    // levantar el dedo) al elemento NUEVO que quedó ahí — que en este caso
    // puede ser el propio campo de texto, recién revelado por el
    // corrimiento — enfocándolo de nuevo y volviendo a abrir el teclado.
    // Con un toque en un lugar en blanco (sin nada reposicionándose debajo)
    // esto no pasa, por eso esa alternativa sí "funcionaba" (a las
    // cansadoras).
    //
    // El arreglo: no tocar el layout (ni la barra ni el padding) hasta que
    // el teclado realmente termine de esconderse de verdad — así, cuando
    // el dedo se levanta, todavía no cambió nada debajo. `e.duration` es
    // la duración real de la animación nativa que Apple reporta en este
    // mismo evento (no un número inventado); el colchón de más es por las
    // dudas el toque tarde un poco más en resolverse del todo.
    let temporizadorOcultar: ReturnType<typeof setTimeout> | null = null;
    const subMostrar = Keyboard.addListener(mostrar, (e) => {
      if (temporizadorOcultar) {
        clearTimeout(temporizadorOcultar);
        temporizadorOcultar = null;
      }
      alturaTecladoRef.current = e.endCoordinates.height;
      setAlturaTeclado(e.endCoordinates.height);
    });
    const subOcultar = Keyboard.addListener(ocultar, (e) => {
      alturaTecladoRef.current = 0;
      const demora = Math.max((e?.duration ?? 0.25) * 1000, 250) + 120;
      temporizadorOcultar = setTimeout(() => {
        temporizadorOcultar = null;
        // Toque sostenido (ver el comentario de dedoEnListoRef, arriba de
        // los refs): el dedo TODAVÍA está apoyado cuando se cumple esta
        // demora — colapsar el layout ahora sería el mismo bug de nuevo.
        // Se marca como pendiente y el propio botón "Listo" lo termina de
        // resolver apenas el dedo se levante de verdad.
        if (dedoEnListoRef.current) {
          colapsoPendienteRef.current = true;
          return;
        }
        setAlturaTeclado(0);
      }, demora);
    });
    return () => {
      subMostrar.remove();
      subOcultar.remove();
      if (temporizadorOcultar) clearTimeout(temporizadorOcultar);
    };
  }, []);

  // Sube el scroll lo justo y necesario para que el campo enfocado quede
  // visible por encima del teclado + la barra "Listo" — reemplaza tanto al
  // scrollToEnd() (que subía de más/de menos porque no medía nada) como a
  // automaticallyAdjustKeyboardInsets (que no sabe que además está la barra
  // flotante encima del teclado, así que dejaba tapado igual el pedacito
  // de abajo). La clave para que measureLayout funcione bien acá es pasarle
  // getNativeScrollRef() del ScrollView como referencia — NO
  // getInnerViewNode(), que es la función vieja (pre-Fabric) que se había
  // usado en el primer intento y tiraba el error "ref.measureLayout debe
  // ser llamado con un ref a...": bajo Fabric ya no devuelve un nodo válido.
  function enfocarCampo(inputRef: React.RefObject<TextInput | null>) {
    setTimeout(() => {
      const nodoScroll = scrollRef.current?.getNativeScrollRef();
      if (!inputRef.current || !nodoScroll) return;
      inputRef.current.measureLayout(
        nodoScroll,
        (_x, y, _w, height) => {
          const obstruccion = alturaTecladoRef.current + MARGEN_TECLADO + ALTURA_BARRA + MARGEN;
          const visible = altoScrollRef.current - obstruccion;
          const desborde = y + height - visible;
          if (desborde > 0) {
            scrollRef.current?.scrollTo({ y: scrollYRef.current + desborde, animated: true });
          }
        },
        () => {}
      );
    }, 300);
  }

  // Toque en la barra "Listo" — ver dedoEnListoRef/colapsoPendienteRef
  // (declarados junto a los demás refs) y el timer de keyboardWillHide/
  // keyboardDidHide: con un toque sostenido, el timer puede cumplirse
  // mientras el dedo TODAVÍA está apoyado, y quedó pendiente de resolver.
  function tocarListo() {
    dedoEnListoRef.current = true;
    Keyboard.dismiss();
  }
  function soltarListo() {
    dedoEnListoRef.current = false;
    if (colapsoPendienteRef.current) {
      colapsoPendienteRef.current = false;
      setAlturaTeclado(0);
    }
  }

  // Superpone, para ESTE punto puntual, lo que todavía está esperando en
  // la cola local sin sincronizar (ver fusionarPendientesEnCargas en
  // offline/resumen.ts, que ya hace esto para la grilla) — sin esto, si
  // alguien guarda un punto sin señal real y vuelve a abrirlo todavía sin
  // señal, no ve lo que acaba de cargar: ni en vivo (no hay señal) ni en
  // la cache (es de antes de cargar este punto). Reportado por el
  // usuario: el dato SÍ estaba a salvo (local y, más tarde, en el
  // server), pero el campo se veía vacío hasta sincronizar.
  function fusionarPendienteDeEstePunto(c: Carga | null, p: Punto, campana: string): Carga | null {
    const cargas = c ? new Map([[p.id, c]]) : new Map<string, Carga>();
    return fusionarPendientesEnCargas(cargas, [p], campana).get(p.id) ?? null;
  }

  function aplicarPuntoYCarga(p: Punto | null, c: Carga | null, usuarioQueCargo: Usuario | null) {
    setPunto(p);
    setCarga(c);
    setForm(
      c
        ? {
            bicho: c.bicho,
            babosa: c.babosa,
            huevoBabosas: c.huevoBabosas,
            gusanoArroz: c.gusanoArroz,
            isocaCortadora: c.isocaCortadora,
            gusanoBlanco: c.gusanoBlanco,
            observaciones: c.observaciones,
          }
        : FORM_VACIO
    );
    setMostrarObservaciones(!!c?.observaciones);
    setUsuarioQueCargo(usuarioQueCargo);
  }

  const refrescar = useCallback(async () => {
    if (!usuario) return;
    try {
      // Chequeo rápido antes de intentar nada — si no hay señal, ni tiene
      // sentido esperar a que el fetch se dé por vencido solo (eso puede
      // tardar bastante) para recién ahí caer al respaldo local. Ver
      // lib/offline/net.ts.
      if (!(await hayConexion())) throw new Error("Sin conexión");
      const [linea, puntoNum] = etiqueta.split(".").map(Number);
      // Punto puntual (no TODOS los del lote) y, más abajo, solo el usuario
      // que cargó este punto (no TODO el equipo) — antes se pedían enteros
      // para buscar ahí adentro un único elemento. Reportado por el
      // usuario: con lotes grandes y equipos grandes, eso se sentía lento
      // en cada punto que se abría — mismo desperdicio que ya se había
      // arreglado hoy para entrar a un lote (ver fetchLoteConEstablecimiento
      // en db/lotes.ts).
      //
      // 15s, no los 10s por default — mismo motivo que en useDatosCampo
      // (ver el comentario ahí): con señal real pero floja, confirmado en
      // el campo que 10s se quedaba corto y esto se caía al cartel de "sin
      // señal" (o directo se sentía "trabado") de pedo, con la señal
      // agarrando bien un instante después (ej. apenas llegando a un lugar
      // con 4G). Reportado hoy: "andaban bien, de golpe no abrían más los
      // puntos, donde agarran 4G ahí sí les abre" — coincide con esto.
      const [l, p] = await conTimeout(Promise.all([fetchLote(loteId), fetchPunto(loteId, linea, puntoNum)]), 15000);
      setLote(l);
      if (l && p) {
        const c = await conTimeout(fetchCarga(p.id, l.campanaActual), 15000);
        const cFusionada = fusionarPendienteDeEstePunto(c, p, l.campanaActual);
        // "Quién cargó esto" es un dato de más, no esencial para poder ver
        // y editar el punto — antes, si ESTE pedido puntual se colgaba con
        // señal floja, tiraba abajo TODO lo demás que ya se había traído
        // bien (punto + carga), cayendo al respaldo de cache de pedo por
        // un dato secundario. Con `.catch` acá, en el peor caso falta el
        // cartel de "Cargado por fulano", pero el punto se ve y se puede
        // trabajar igual.
        const usuarioQueCargo = cFusionada?.cargadoPorId
          ? await conTimeout(fetchUsuarioPorId(cFusionada.cargadoPorId), 15000).catch(() => null)
          : null;
        aplicarPuntoYCarga(p, cFusionada, usuarioQueCargo);
      } else {
        aplicarPuntoYCarga(p, null, null);
      }
      setUsandoCache(false);
    } catch (e: any) {
      // Sin señal: en vez de dejar la pantalla trabada con un error (el
      // caso más común de esto es justo el que más importa — alguien que
      // llega al punto ya sin cobertura), usamos la última foto guardada
      // de este lote si existe (ver lib/offline/cache-lote.ts, la escribe
      // Vista General/Modo trabajo en cada visita con señal). Si nunca se
      // visitó este lote con señal, no hay nada que mostrar y ahí sí no
      // queda otra que avisar que falló.
      const cache = leerCacheLote(loteId);
      if (cache) {
        const [linea, puntoNum] = etiqueta.split(".").map(Number);
        const p = cache.puntos.find((x) => x.linea === linea && x.puntoNum === puntoNum) ?? null;
        setLote(cache.lote);
        const c = p ? (cache.cargas.get(p.id) ?? null) : null;
        aplicarPuntoYCarga(p, p ? fusionarPendienteDeEstePunto(c, p, cache.lote.campanaActual) : null, null);
        setUsandoCache(true);
      } else {
        Alert.alert("No se pudo cargar el punto", e.message ?? String(e));
      }
    } finally {
      setCargando(false);
    }
  }, [loteId, etiqueta, usuario]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // URLs firmadas para mostrar las fotos ya subidas (el bucket es privado).
  useEffect(() => {
    if (!carga || carga.fotos.length === 0) return;
    carga.fotos.forEach((path) => {
      if (fotoUrls[path]) return;
      getFotoUrl(path)
        .then((url) => setFotoUrls((prev) => ({ ...prev, [path]: url })))
        .catch(() => {});
    });
  }, [carga, fotoUrls]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (!usuario || !lote || !punto) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.aviso}>No se encontró el punto.</Text>
      </View>
    );
  }

  const isOwner = carga?.cargadoPorId === usuario.id;
  const puedeEditarSiConfirma = isOwner || puedeAdministrarLotes(usuario.rol);
  // Bloqueado sin ninguna posibilidad de pedir permiso: es el punto de otra
  // persona y no tenés acceso para tocarlo (Monitoreador sobre punto ajeno).
  const bloqueadoDelTodo = !!carga?.confirmado && !puedeEditarSiConfirma;
  // Está cerrado, pero SE PUEDE pedir editarlo — falta el "sí, quiero editar".
  const necesitaConfirmarReapertura = !!carga?.confirmado && puedeEditarSiConfirma && !confirmoReapertura;
  const camposDeshabilitados = bloqueadoDelTodo || necesitaConfirmarReapertura;

  async function handleReabrir() {
    if (!lote || !punto) return;
    try {
      await reabrirCarga(punto.id, lote.campanaActual);
      setConfirmoReapertura(true);
    } catch (e: any) {
      Alert.alert("No se pudo reabrir el punto", e.message ?? String(e));
    }
  }

  async function handleGuardar() {
    if (!lote || !punto || !usuario) return;
    setGuardando(true);
    try {
      // Mismo chequeo rápido que en refrescar — sin señal, ni vale la pena
      // esperar a que el intento real se dé por vencido solo antes de
      // encolar (ver lib/offline/net.ts).
      if (!(await hayConexion())) throw new Error("Sin conexión");
      // 15s, no los 10s por default de conTimeout — mismo margen que se le
      // dio a las lecturas de esta misma pantalla (ver refrescar más
      // arriba), para no encolar de pedo un guardado que solo iba un poco
      // lento, no realmente sin señal.
      await conTimeout(guardarYConfirmarCarga(punto.id, lote.campanaActual, form, usuario.id), 15000);
      router.back();
    } catch (e: any) {
      // Sin conexión (o el server no respondió a tiempo) — en vez de perder
      // lo que se cargó, queda guardado en la cola local del dispositivo y
      // se sube solo apenas vuelva la señal (ver lib/sync-context.tsx). El
      // form ya está confirmado del lado de la persona, por eso sí se
      // vuelve atrás — no tiene sentido dejarla trabada en la pantalla
      // esperando a que haya señal. Sin alerta acá: el contador de
      // "cambios sin subir" del header ya avisa que quedó pendiente, un
      // cartel aparte en cada punto no aportaba nada (pedido explícito del
      // usuario tras probarlo).
      agregarCambioPendiente({
        tipo: "carga",
        puntoId: punto.id,
        campana: lote.campanaActual,
        campos: form,
        cargadoPorId: usuario.id,
      });
      avisarCambioEncolado();
      router.back();
    } finally {
      setGuardando(false);
    }
  }

  async function subirYGuardarFoto(uri: string) {
    if (!lote || !punto || !usuario) return;
    setSubiendoFoto(true);
    try {
      // Acá NO se usa conTimeout para la subida en sí (subirFoto): un
      // archivo pesa más que una consulta común y puede tardar de verdad
      // con una conexión lenta pero real — cortarla a los 4 segundos
      // convertiría una subida lenta-pero-exitosa en un falso "sin
      // conexión". El chequeo rápido de antes sí sirve (si YA se sabe que
      // no hay señal, ni vale la pena intentar).
      if (!(await hayConexion())) throw new Error("Sin conexión");
      const path = await subirFoto(lote.id, punto.id, uri);
      const c = await conTimeout(agregarFotoACarga(punto.id, lote.campanaActual, path, usuario.id));
      setCarga(c);
    } catch (e: any) {
      // Mismo criterio que handleGuardar: sin conexión, la foto queda
      // encolada (con su URI local) en vez de perderse — se sube sola
      // cuando vuelva la señal. Acá no hay "carga" que actualizar en
      // pantalla todavía (recién se crea cuando se sincroniza de verdad),
      // así que solo se avisa que quedó pendiente.
      agregarCambioPendiente({
        tipo: "foto",
        puntoId: punto.id,
        campana: lote.campanaActual,
        loteId: lote.id,
        uriLocal: uri,
        cargadoPorId: usuario.id,
      });
      avisarCambioEncolado();
      Alert.alert("Sin conexión", "La foto quedó guardada en el celular y se va a subir sola apenas haya señal.");
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function elegirFoto() {
    Alert.alert("Adjuntar foto", undefined, [
      {
        text: "Tomar foto",
        onPress: async () => {
          const permiso = await ImagePicker.requestCameraPermissionsAsync();
          if (permiso.status !== "granted") {
            Alert.alert("Sin permiso", "Habilitá el acceso a la cámara para sacar la foto.");
            return;
          }
          const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.6 });
          if (!resultado.canceled) await subirYGuardarFoto(resultado.assets[0].uri);
        },
      },
      {
        text: "Elegir de la galería",
        onPress: async () => {
          const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permiso.status !== "granted") {
            Alert.alert("Sin permiso", "Habilitá el acceso a tus fotos.");
            return;
          }
          const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.6 });
          if (!resultado.canceled) await subirYGuardarFoto(resultado.assets[0].uri);
        },
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  async function quitarFoto(path: string) {
    if (!lote || !punto) return;
    try {
      const c = await quitarFotoDeCarga(punto.id, lote.campanaActual, path);
      await eliminarFoto(path);
      setCarga(c);
    } catch (e: any) {
      Alert.alert("No se pudo quitar la foto", e.message ?? String(e));
    }
  }

  return (
    <View style={styles.raiz}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.container,
          // Colchón real (no un número inventado) para que siempre haya
          // lugar de sobra debajo del último campo y enfocarCampo pueda
          // subir el scroll lo que haga falta, sea cual sea el teclado.
          alturaTeclado > 0 && { paddingBottom: 20 + alturaTeclado + MARGEN_TECLADO + ALTURA_BARRA + MARGEN },
        ]}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => {
          altoScrollRef.current = e.nativeEvent.layout.height;
        }}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
      <View style={styles.filaTitulo}>
        <MapPin size={16} color={colors.primaryDark} />
        <Text style={styles.titulo}>Punto {etiqueta}</Text>
      </View>

      {usandoCache && (
        <Text style={styles.avisoCache}>
          📡 Sin señal — mostrando la última versión guardada en este celular. Lo que cargues acá se guarda igual
          y se sube solo cuando vuelva la señal.
        </Text>
      )}

      {usuarioQueCargo && (
        <View style={[styles.tagUsuario, { borderColor: usuarioQueCargo.color }]}>
          <Text style={[styles.tagUsuarioTexto, { color: usuarioQueCargo.color }]}>
            Cargado por {usuarioQueCargo.nombre}
          </Text>
        </View>
      )}

      {bloqueadoDelTodo && (
        <View style={styles.bannerBloqueado}>
          <Lock size={13} color={colors.danger} />
          <Text style={styles.bannerBloqueadoTexto}>
            Ya fue muestreado por {usuarioQueCargo?.nombre ?? "otra persona"} — no podés editarlo.
          </Text>
        </View>
      )}

      {necesitaConfirmarReapertura && !bloqueadoDelTodo && (
        <View style={styles.bannerReapertura}>
          <Text style={styles.bannerReaperturaTexto}>
            Punto cerrado por {usuarioQueCargo?.nombre ?? "otra persona"} — ¿querés editarlo?
          </Text>
          <View style={styles.bannerReaperturaBotones}>
            <Pressable style={styles.botonCancelar} onPress={() => router.back()}>
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.botonReabrir} onPress={handleReabrir}>
              <Text style={styles.botonReabrirTexto}>Sí, editar</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.grupoLabel}>Conteos</Text>
      <NumberField
        ref={bichoRef}
        label="Bichos bolita"
        value={form.bicho}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, bicho: v }))}
        onFocus={() => enfocarCampo(bichoRef)}
      />
      <NumberField
        ref={babosaRef}
        label="Babosas"
        value={form.babosa}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, babosa: v }))}
        onFocus={() => enfocarCampo(babosaRef)}
      />

      <Text style={styles.grupoLabel}>Presencia</Text>
      <YesNoField
        label="Huevo de babosas"
        value={form.huevoBabosas}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, huevoBabosas: v }))}
      />
      <YesNoField
        label="Gusano de arroz"
        value={form.gusanoArroz}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, gusanoArroz: v }))}
      />
      <YesNoField
        label="Isoca cortadora"
        value={form.isocaCortadora}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, isocaCortadora: v }))}
      />
      <YesNoField
        label="Gusano blanco"
        value={form.gusanoBlanco}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, gusanoBlanco: v }))}
      />

      {!camposDeshabilitados && (
        <>
          <Pressable style={styles.botonSecundario} onPress={() => setMostrarObservaciones((v) => !v)}>
            <Pencil size={15} color={colors.primaryDark} />
            <Text style={styles.botonSecundarioTexto}>
              Observaciones{form.observaciones ? " (con texto)" : ""}
            </Text>
          </Pressable>
          {mostrarObservaciones && (
            <TextInput
              ref={observacionesRef}
              style={styles.observaciones}
              placeholder="Anotá algo puntual sobre este punto…"
              placeholderTextColor={colors.textMuted}
              multiline
              value={form.observaciones}
              onChangeText={(t) => setForm((f) => ({ ...f, observaciones: t }))}
              onFocus={() => enfocarCampo(observacionesRef)}
            />
          )}

          {carga && carga.fotos.length > 0 && (
            <View style={styles.fotosFila}>
              {carga.fotos.map((path) => (
                <View key={path} style={styles.fotoItem}>
                  {fotoUrls[path] && <Image source={{ uri: fotoUrls[path] }} style={styles.fotoImg} />}
                  <Pressable style={styles.fotoQuitar} onPress={() => quitarFoto(path)}>
                    <X size={11} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Pressable style={styles.botonSecundario} onPress={elegirFoto} disabled={subiendoFoto}>
            <Camera size={15} color={colors.primaryDark} />
            <Text style={styles.botonSecundarioTexto}>
              {subiendoFoto
                ? "Subiendo…"
                : carga && carga.fotos.length > 0
                  ? "Agregar otra foto"
                  : "Adjuntar foto"}
            </Text>
          </Pressable>
        </>
      )}

      {bloqueadoDelTodo ? (
        <Pressable style={styles.botonBloqueado} onPress={() => router.back()}>
          <Lock size={15} color={colors.surface} />
          <Text style={styles.botonBloqueadoTexto}>Cerrado por {usuarioQueCargo?.nombre ?? "otra persona"}</Text>
        </Pressable>
      ) : necesitaConfirmarReapertura ? null : (
        <Pressable style={styles.botonConfirmar} onPress={handleGuardar} disabled={guardando}>
          <Check size={15} color={colors.surface} />
          <Text style={styles.botonConfirmarTexto}>
            {guardando ? "Guardando…" : carga?.confirmado ? "Guardar cambios" : "Confirmar y cerrar punto"}
          </Text>
        </Pressable>
      )}
      </ScrollView>

      {/* SIEMPRE montada (ya no `{alturaTeclado > 0 && (...)}`) — a
          pedido del usuario, que en el campo notó que "Listo" a veces
          bajaba el teclado y lo volvía a subir enseguida, como en flash.
          La sospecha más fuerte: `Keyboard.dismiss()` dispara
          `keyboardWillHide`, que en el render siguiente ponía
          `alturaTeclado` en 0 y DESMONTABA esta vista — con el toque
          todavía "vivo" (el sistema de responder de RN no siempre termina
          de procesar un toque de forma instantánea), sacar de la pantalla
          la vista que lo estaba manejando a mitad de camino es un
          escenario conocido para que iOS reaccione raro. Ahora esta barra
          nunca desaparece del árbol — solo se corre AFUERA de la pantalla
          (`bottom` bien negativo) cuando no hace falta, y de paso se le
          saca el toque con `pointerEvents="none"` para que ni ahí, ni
          mientras el teclado está bajando, tape nada por accidente. */}
      <View
        style={[styles.barraFlotante, { bottom: alturaTeclado > 0 ? alturaTeclado + MARGEN_TECLADO : -ALTURA_BARRA - 40 }]}
        pointerEvents={alturaTeclado > 0 ? "auto" : "none"}
      >
        {/* View con el sistema de responder nativo directo (no Pressable)
            — con un TextInput enfocado, en iOS el primer toque sobre
            OTRO elemento a veces se lo "come" el sistema al resignar el
            foco del input (blur nativo), y de paso Pressable negocia el
            gesto con su propia lógica de Pressability antes de disparar
            cualquier callback — entre las dos cosas, el primer toque se
            perdía y recién el segundo funcionaba. Tres disparadores
            redundantes en vez de uno solo, cualquiera de los tres
            alcanza y Keyboard.dismiss() no hace nada raro si se llama de
            más de una vez:
            1. onStartShouldSetResponderCapture, fase de CAPTURA — se
               evalúa de arriba hacia abajo ANTES que la de bubbling, así
               que esta vista se queda con el toque lo antes posible,
               sin que nada más arriba en el árbol pueda interceptarlo
               primero.
            2. onResponderGrant, por si algo más abajo llegara a captar
               el responder primero (no debería, pero es la vía que ya
               había funcionado antes).
            3. onTouchStart, el evento de toque más crudo de todos — no
               depende para nada del sistema de responder ni de ninguna
               negociación, dispara apenas el dedo toca la vista.

            Al soltar: mismo criterio, tres disparadores redundantes
            (onResponderRelease/onResponderTerminate/onTouchEnd) — con
            cualquiera de los tres alcanza para saber que el dedo YA no
            está más apoyado (ver tocarListo/soltarListo, arriba). */}
        <View
          style={styles.botonListoFlotante}
          onStartShouldSetResponderCapture={() => true}
          onStartShouldSetResponder={() => true}
          onResponderGrant={tocarListo}
          onTouchStart={tocarListo}
          onResponderRelease={soltarListo}
          onResponderTerminate={soltarListo}
          onTouchEnd={soltarListo}
        >
          <Text style={styles.botonListoFlotanteTexto}>Listo</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  aviso: { color: colors.textMuted },
  raiz: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 4, backgroundColor: colors.background },
  filaTitulo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  titulo: { fontSize: 18, fontWeight: "800", color: colors.text },
  tagUsuario: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  tagUsuarioTexto: { fontSize: 11, fontWeight: "700" },
  avisoCache: {
    fontSize: 11.5,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    fontWeight: "600",
    lineHeight: 16,
  },
  bannerBloqueado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  bannerBloqueadoTexto: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: "600" },
  bannerReapertura: {
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  bannerReaperturaTexto: { fontSize: 13, color: colors.text, fontWeight: "600" },
  bannerReaperturaBotones: { flexDirection: "row", gap: 8 },
  botonCancelar: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: colors.surface },
  botonCancelarTexto: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  botonReabrir: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: colors.primaryConfirm },
  botonReabrirTexto: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  grupoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 2,
  },
  botonSecundario: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  botonSecundarioTexto: { color: colors.primaryDark, fontWeight: "600", fontSize: 13 },
  observaciones: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    minHeight: 70,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  // Barra "Listo" propia, posicionada a mano justo arriba del teclado (ver
  // alturaTeclado) — reemplaza a InputAccessoryView, que resultó poco
  // confiable con varios campos de texto en la misma pantalla. Altura fija
  // (no por contenido) para que ALTURA_BARRA sea siempre exacta.
  // Antes ocupaba TODO el ancho de pantalla (left: 0, right: 0) como una
  // franja blanca completa — tapaba "Adjuntar foto" y "Confirmar y cerrar
  // punto" que quedaban justo debajo. Ahora es una píldora chica, pegada
  // a la derecha (sin `left`, así el View se achica al contenido en vez
  // de estirarse) con sombra propia para distinguirse del fondo — deja
  // ver todo lo que está debajo salvo el rincón donde vive el botón.
  barraFlotante: {
    position: "absolute",
    right: 16,
    height: ALTURA_BARRA,
    borderRadius: ALTURA_BARRA / 2,
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  botonListoFlotante: { paddingHorizontal: 18, paddingVertical: 10 },
  botonListoFlotanteTexto: { color: colors.primary, fontWeight: "700", fontSize: 18 },
  fotosFila: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  fotoItem: { width: 64, height: 64 },
  fotoImg: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  fotoQuitar: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  botonBloqueado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 20,
  },
  botonBloqueadoTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  botonConfirmar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 20,
  },
  botonConfirmarTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
});

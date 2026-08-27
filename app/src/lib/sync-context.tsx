// Sincronización automática de la cola offline — dispara sincronizarPendientes()
// (ver lib/offline/sincronizar.ts) cada vez que hay una chance real de que
// funcione: al volver la conexión (NetInfo) y al volver la app a primer
// plano (AppState). Expuesto como contexto (mismo patrón que AuthContext)
// para que cualquier pantalla pueda mostrar "3 cambios pendientes" o un
// botón "Sincronizar ahora" sin duplicar el estado.
//
// Notificaciones LOCALES (no push): expo-notifications sin remote push
// funciona bien dentro de Expo Go — es el push remoto (y las tareas
// realmente en segundo plano, con la app cerrada del todo) lo que necesita
// un development build propio, ver AGENTS.md. Así que esto avisa "se
// sincronizaron 3 cambios" cuando la app estaba en background en el
// momento en que se resolvió la cola (si la persona está mirando la
// pantalla en ese momento, ya lo ve solo con que el contador baje, no hace
// falta la notificación también).

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Notifications from "expo-notifications";

import { contarCambiosPendientes } from "./offline/cola";
import { sincronizarPendientes } from "./offline/sincronizar";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

interface SyncState {
  /** Cuántos cambios están esperando en la cola local, sin subir todavía. */
  pendientes: number;
  sincronizando: boolean;
  /** Fuerza un intento ya mismo — para un botón "Sincronizar ahora" a mano. */
  sincronizarAhora: () => Promise<void>;
  /** Avisa "acabo de encolar un cambio" — actualiza el contador al toque
   * (no hace falta esperar al próximo NetInfo/AppState para que se note en
   * pantalla) sin forzar un intento de red inmediato. */
  avisarCambioEncolado: () => void;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  // En qué estado está la app AHORA MISMO — un ref porque el listener de
  // NetInfo necesita el valor más nuevo en el momento en que se dispara,
  // no el que tenía en el render donde se armó el listener.
  const appStateRef = useRef(AppState.currentState);
  const sincronizandoRef = useRef(false);

  async function refrescarContador() {
    setPendientes(contarCambiosPendientes());
  }

  async function sincronizarAhora() {
    // Evita superponer dos corridas (por ej. NetInfo y AppState disparando
    // casi al mismo tiempo) — la cola es la misma, la segunda no aporta nada.
    if (sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    setSincronizando(true);
    try {
      const estabaEnBackground = appStateRef.current !== "active";
      const { sincronizados, conflictos } = await sincronizarPendientes();
      await refrescarContador();
      if (sincronizados > 0 && estabaEnBackground) {
        await avisarSincronizacion(sincronizados, conflictos);
      }
    } finally {
      sincronizandoRef.current = false;
      setSincronizando(false);
    }
  }

  useEffect(() => {
    // Pedido de permiso una sola vez por sesión — sin bloquear nada si lo
    // rechaza: la cola y el reintento funcionan igual, solo no habría
    // notificación visible.
    Notifications.requestPermissionsAsync().catch(() => {});

    refrescarContador();
    sincronizarAhora(); // por si ya había cambios pendientes de una sesión anterior

    const subAppState = AppState.addEventListener("change", (estado) => {
      const volvioAPrimerPlano = appStateRef.current !== "active" && estado === "active";
      appStateRef.current = estado;
      if (volvioAPrimerPlano) sincronizarAhora();
    });

    const subNetInfo = NetInfo.addEventListener((estado) => {
      if (estado.isConnected) sincronizarAhora();
    });

    return () => {
      subAppState.remove();
      subNetInfo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners fijos, se arman una sola vez
  }, []);

  const value = useMemo<SyncState>(
    () => ({ pendientes, sincronizando, sincronizarAhora, avisarCambioEncolado: refrescarContador }),
    [pendientes, sincronizando]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

async function avisarSincronizacion(cantidad: number, conflictos: number): Promise<void> {
  try {
    let body = cantidad === 1 ? "Se sincronizó 1 cambio pendiente." : `Se sincronizaron ${cantidad} cambios pendientes.`;
    if (conflictos > 0) {
      body +=
        conflictos === 1
          ? " Un punto quedó duplicado, esperando que un Socio lo resuelva."
          : ` ${conflictos} puntos quedaron duplicados, esperando que un Socio los resuelva.`;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: "Zoom Agricultura", body },
      trigger: null, // ya mismo
    });
  } catch {
    // Sin permiso o sin soporte (ej. simulador) — la sincronización en sí
    // ya se hizo, la notificación es solo un plus.
  }
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync debe usarse dentro de <SyncProvider>");
  return ctx;
}

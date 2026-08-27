import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { SyncProvider } from "@/lib/sync-context";
import { colors } from "@/theme/colors";

export default function AppLayout() {
  const { loading, session, usuario } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (!session || !usuario) return <Redirect href="/login" />;

  // La cola offline (ver lib/sync-context.tsx) solo tiene sentido con
  // sesión activa — cargadoPorId sale del usuario logueado, así que
  // arrancarla acá (adentro del gate de auth) en vez de en el _layout raíz.
  return (
    <SyncProvider>
      <AppLayoutStack />
    </SyncProvider>
  );
}

function AppLayoutStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="equipo" options={{ title: "Mi equipo" }} />
      <Stack.Screen name="lote/[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="lote/[id]/modo-trabajo" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="lote/[id]/punto/[puntoId]" options={{ title: "Registro de datos", presentation: "modal" }} />
    </Stack>
  );
}

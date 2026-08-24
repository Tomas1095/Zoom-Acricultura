import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
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
      <Stack.Screen name="lote/[id]/index" options={{ title: "" }} />
      <Stack.Screen name="lote/[id]/modo-trabajo" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="lote/[id]/punto/[puntoId]" options={{ title: "Punto", presentation: "modal" }} />
    </Stack>
  );
}

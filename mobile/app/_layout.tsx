import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Stack,
  useRouter,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AuthProvider,
  useAuth,
  isFamilyBillingBlocked,
  userCanManageFamilyBilling,
} from "../src/contexts/AuthContext";
import "../src/lib/locationBackgroundTask";
import { FirstAccessPasswordModal } from "../src/components/auth/FirstAccessPasswordModal";
import { IntroVideo } from "../src/components/auth/IntroVideo";

const INTRO_SEEN_KEY = "familia_intro_seen";

function RootLayoutNav() {
  const [showIntro, setShowIntro] = useState(false);
  const { user, family, effectiveSubscription, loading, isChildProxy } =
    useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((v) => {
        console.info("INTRO_SEEN_KEY", v);
        if (v !== "1") setShowIntro(true);
      })
      .catch(() => {});
  }, []);

  const finishIntro = () => {
    AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {});
    setShowIntro(false);
  };

  useEffect(() => {
    if (loading || !navigationState?.key) return;

    const currentSegment = segments[0] as string | undefined;
    const publicRoutes = ["login", "onboarding", "register", "index"];
    const billingRoutes = ["subscribe", "billing-wait-gestor"];

    if (!user) {
      if (!publicRoutes.includes(currentSegment || "")) {
        router.replace("/login");
      }
      return;
    }

    if (user.role === "parent" && !user.has_onboarded) {
      if (currentSegment !== "parent" || segments[1] !== "onboarding") {
        router.replace("/parent/onboarding");
      }
      return;
    }

    if (user.role === "master") {
      if (currentSegment !== "master") {
        router.replace("/master");
      }
      return;
    }

    const billingBlocked = isFamilyBillingBlocked(
      family,
      effectiveSubscription,
    );
    if (billingBlocked) {
      const canPay = userCanManageFamilyBilling(user, effectiveSubscription);
      const dest = canPay ? "/subscribe" : "/billing-wait-gestor";
      if (!billingRoutes.includes(currentSegment || "")) {
        router.replace(dest);
      }
      return;
    }

    if (isChildProxy && (user.role === "parent" || user.role === "relative")) {
      if (currentSegment !== "child") {
        router.replace("/child");
      }
      return;
    }

    if (
      publicRoutes.includes(currentSegment || "") ||
      billingRoutes.includes(currentSegment || "")
    ) {
      const target =
        user.role === "parent" || user.role === "relative"
          ? "parent"
          : user.role === "child"
            ? "child"
            : "master";
      router.replace(`/${target}` as "/parent" | "/child" | "/master");
      return;
    }

    const role = user.role;
    const target =
      role === "parent" || role === "relative"
        ? "parent"
        : role === "child"
          ? "child"
          : "master";

    if (currentSegment !== target) {
      router.replace(`/${target}` as "/parent" | "/child" | "/master");
    }
  }, [
    user,
    family,
    effectiveSubscription,
    loading,
    isChildProxy,
    segments,
    router,
    navigationState?.key,
  ]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <FirstAccessPasswordModal />
      {showIntro ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <IntroVideo onFinish={finishIntro} />
        </View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaProvider style={{ paddingBottom: insets.bottom }}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

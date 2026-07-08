import React, { useEffect, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { useAuthStatus } from "@/hooks/useAuth";
import { Animated, View, Text, StyleSheet, Dimensions, StatusBar } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function Index() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStatus();
  const [animationDone, setAnimationDone] = useState(false);
  const [redirectReady, setRedirectReady] = useState(false);

  // Animated values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  const router = useRouter();

  useEffect(() => {
    // Start splash screen animations
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.timing(progressWidth, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false, // width animation doesn't support native driver
      }),
    ]).start();

    // Enforce a minimum display time for the splash screen (e.g. 2.2 seconds)
    const timer = setTimeout(() => {
      setAnimationDone(true);
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  // When both auth check is completed and the minimum splash duration is met
  useEffect(() => {
    if (animationDone && !isAuthLoading) {
      // Trigger a smooth fade out of the splash screen
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setRedirectReady(true);
      });
    }
  }, [animationDone, isAuthLoading]);

  // Perform redirect once the fade out animation is complete
  if (redirectReady) {
    if (isAuthenticated) {
      return <Redirect href="/(tabs)/index" />;
    }
    return <Redirect href="/(auth)/login" />;
  }

  // Interpolate progress width
  const loaderWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width * 0.5],
  });

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
      
      {/* Glow effect background */}
      <View style={styles.glowCircle} />

      <View style={styles.centerContent}>
        {/* Animated Icon Container */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Ionicons name="location" size={48} color="#3B82F6" />
        </Animated.View>

        {/* Animated Brand Name */}
        <Animated.View style={{ opacity: textOpacity }}>
          <Text style={styles.brandName}>TRUCK TRACKER</Text>
          <Text style={styles.brandSub}>LOGISTICS & TRACKING</Text>
        </Animated.View>
      </View>

      {/* Modern thin line progress bar */}
      <View style={styles.loaderContainer}>
        <Animated.View style={[styles.loaderBar, { width: loaderWidth }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B132B", // Rich navy minimalist background
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 80,
  },
  glowCircle: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(59, 130, 246, 0.08)", // Soft blue glow
    top: "30%",
    left: "50%",
    marginLeft: -150,
    filter: "blur(40px)" as any, // Blur for native when supported
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 60,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(30, 41, 59, 0.6)", // Glassmorphism container
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  brandName: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 8,
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.15)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandSub: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 4,
    textAlign: "center",
    marginTop: 8,
    textTransform: "uppercase",
    opacity: 0.8,
  },
  loaderContainer: {
    height: 3,
    width: width * 0.5,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 2,
    overflow: "hidden",
  },
  loaderBar: {
    height: "100%",
    backgroundColor: "#3B82F6", // Primary blue accent
    borderRadius: 2,
  },
});

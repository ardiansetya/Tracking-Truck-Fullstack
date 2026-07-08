// hooks/usePositionTracker.ts
import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation, LocationData } from "./useLocation";
import { BackgroundLocationService } from "@/services/backgroundLocationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import * as Location from 'expo-location';

interface UsePositionTrackerOptions {
  autoTrack?: boolean; // Automatically start tracking when component mounts
  interval?: number; // Interval in milliseconds to send position updates
  restInterval?: number; // Interval when resting (default 5 min) — slower but still tracked
  useBackgroundTracking?: boolean; // Use background location service
  distanceInterval?: number; // Distance in meters to trigger update
  deliveryId?: string; // Active delivery ID to send alerts for
  isResting?: boolean; // Reduce sending frequency when driver is in rest mode
}

interface UsePositionTrackerReturn {
  isTracking: boolean;
  isBackgroundTracking: boolean;
  location: LocationData | null;
  isLoadingLocation: boolean;
  locationError: string | null;
  isSendingPosition: boolean;
  sendPositionError: string | null;
  lastSentAt: Date | null;
  isMocked: boolean;
  isResting: boolean;
  hasBackgroundPermission: boolean;
  startTracking: () => void;
  stopTracking: () => void;
  sendCurrentPosition: () => Promise<void>;
  startBackgroundTracking: () => Promise<boolean>;
  stopBackgroundTracking: () => Promise<boolean>;
  checkBackgroundPermissions: () => Promise<void>;
}

export const usePositionTracker = (
  options: UsePositionTrackerOptions = {}
): UsePositionTrackerReturn => {
  const {
    autoTrack = false,
    interval = 60000,
    restInterval = 300000, // 5 minutes default when resting
    deliveryId,
    isResting = false,
  } = options;

  // Active interval: use restInterval when resting, normal interval otherwise
  const activeInterval = isResting ? restInterval : interval;

  useEffect(() => {
    AsyncStorage.setItem('active_interval', String(activeInterval)).catch(err => console.error(err));
  }, [activeInterval]);

  const [isTracking, setIsTracking] = useState(false);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const isTrackingRef = useRef(false);

  // Sync active deliveryId and isResting state to AsyncStorage for Background Task callback
  useEffect(() => {
    if (deliveryId) {
      AsyncStorage.setItem('active_delivery_id', deliveryId).catch(err => console.error(err));
    } else {
      AsyncStorage.removeItem('active_delivery_id').catch(err => console.error(err));
    }
  }, [deliveryId]);

  useEffect(() => {
    AsyncStorage.setItem('is_resting', isResting ? 'true' : 'false').catch(err => console.error(err));
  }, [isResting]);

  const {
    location,
    isLoading: isLoadingLocation,
    error: locationError,
    isMocked,
    startWatchingLocation,
    stopWatchingLocation,
  } = useLocation();

  // Listen to background task events to sync UI state
  useEffect(() => {
    const sendingSub = DeviceEventEmitter.addListener('position-sending', () => {
      setIsSending(true);
      setSendError(null);
    });

    const sentSub = DeviceEventEmitter.addListener('position-sent', (event) => {
      setIsSending(false);
      setLastSentAt(event.lastSentAt ? new Date(event.lastSentAt) : new Date());
      setSendError(null);
    });

    const errorSub = DeviceEventEmitter.addListener('position-send-error', (event) => {
      setIsSending(false);
      setSendError(event.error || "Gagal mengirim lokasi");
    });

    return () => {
      sendingSub.remove();
      sentSub.remove();
      errorSub.remove();
    };
  }, []);

  // Check background permissions status
  const checkBackgroundPermissions = useCallback(async () => {
    try {
      const permissions = await BackgroundLocationService.checkPermissions();
      const hasPermission =
        permissions.foreground === 'granted' &&
        permissions.background === 'granted';

      setHasBackgroundPermission(hasPermission);
    } catch (error) {
      console.error("❌ Error checking background permissions:", error);
      setHasBackgroundPermission(false);
    }
  }, []);

  // Check permissions on mount
  useEffect(() => {
    checkBackgroundPermissions();
  }, [checkBackgroundPermissions]);

  // Sync running status on mount
  useEffect(() => {
    const syncStatus = async () => {
      const running = await BackgroundLocationService.isRunning();
      setIsTracking(running);
      isTrackingRef.current = running;
    };
    syncStatus();
  }, []);

  // Start tracking via background location task
  const startTracking = useCallback(async () => {
    if (isTrackingRef.current) {
      console.log("⚠️ Already tracking, skipping start");
      return;
    }

    console.log("🚀 Starting background location tracking task...");
    console.log("📊 Interval:", activeInterval, "ms");

    try {
      // 1. Start watching location locally for UI/map display
      await startWatchingLocation();

      // 2. Start global background task with the current interval config
      const success = await BackgroundLocationService.start({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: activeInterval,
        forceRestart: true,
      });

      if (success) {
        setIsTracking(true);
        isTrackingRef.current = true;
      }
    } catch (error) {
      console.error("❌ Failed to start tracking:", error);
      setIsTracking(false);
      isTrackingRef.current = false;
    }
  }, [activeInterval, startWatchingLocation]);

  // Stop tracking
  const stopTracking = useCallback(async () => {
    if (!isTrackingRef.current) {
      console.log("⚠️ Not tracking, skipping stop");
      return;
    }

    console.log("🛑 Stopping background location tracking task...");
    try {
      stopWatchingLocation();
      await BackgroundLocationService.stop();
    } catch (error) {
      console.error("❌ Error during tracking stop:", error);
    } finally {
      setIsTracking(false);
      isTrackingRef.current = false;
    }
  }, [stopWatchingLocation]);

  // Handle activeInterval changes (restarting the background service with new interval)
  useEffect(() => {
    if (isTrackingRef.current) {
      console.log("🔄 activeInterval changed to:", activeInterval, "ms — reconfiguring background service");
      BackgroundLocationService.start({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: activeInterval,
        forceRestart: true,
      }).catch(err => console.error("❌ Failed to reconfigure interval:", err));
    }
  }, [activeInterval]);

  // Force single immediate location update
  const sendCurrentPosition = useCallback(async (): Promise<void> => {
    const success = await BackgroundLocationService.sendSingleUpdate();
    if (!success) {
      throw new Error("Gagal mengirim lokasi saat ini");
    }
  }, []);

  // Auto-start / Auto-stop based on autoTrack option
  useEffect(() => {
    if (autoTrack) {
      const timer = setTimeout(() => {
        startTracking();
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      stopTracking();
    }
  }, [autoTrack, startTracking, stopTracking]);

  return {
    isTracking,
    isBackgroundTracking: isTracking, // Both represent background task running
    location,
    isLoadingLocation,
    locationError,
    isMocked,
    isResting,
    hasBackgroundPermission,
    isSendingPosition: isSending,
    sendPositionError: sendError,
    lastSentAt,
    startTracking,
    stopTracking,
    sendCurrentPosition,
    startBackgroundTracking: async () => { await startTracking(); return true; },
    stopBackgroundTracking: async () => { await stopTracking(); return true; },
    checkBackgroundPermissions,
  };
};

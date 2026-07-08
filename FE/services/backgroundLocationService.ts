import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, DeviceEventEmitter } from 'react-native';
import api from './axios';
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';

notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('[Notifee] Background event received:', type);
});

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const OFFLINE_QUEUE_KEY = 'offline_positions_queue';

interface PositionPayload {
  latitude: number;
  longitude: number;
  recorded_at: number;
}

interface QueuedPosition {
  latitude: number;
  longitude: number;
  recorded_at: number;
}

/**
 * AsyncStorage offline queue helpers
 */
async function getOfflineQueue(): Promise<QueuedPosition[]> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('❌ Background Queue: Failed to read offline queue:', error);
    return [];
  }
}

async function saveOfflineQueue(queue: QueuedPosition[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('❌ Background Queue: Failed to save offline queue:', error);
  }
}

async function addToOfflineQueue(pos: QueuedPosition): Promise<void> {
  const queue = await getOfflineQueue();
  queue.push(pos);
  if (queue.length > 500) {
    queue.splice(0, queue.length - 500); // Discard oldest
  }
  await saveOfflineQueue(queue);
  console.log(`📦 Background Queue: Queued position. Size: ${queue.length}`);
}

/**
 * Send position to backend using api client (handles refresh & interceptors automatically)
 */
async function sendPositionWithAuth(payload: PositionPayload): Promise<boolean> {
  try {
    DeviceEventEmitter.emit('position-sending');
    const response = await api.post('/api/delivery/position', payload, {
      timeout: 10000,
    });

    if (response.status === 200) {
      console.log('✅ Background: Position sent successfully at', new Date().toISOString());
      await AsyncStorage.setItem('last_sent_timestamp', String(payload.recorded_at));
      DeviceEventEmitter.emit('position-sent', { lastSentAt: new Date().toISOString() });
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('❌ Background: Send failed:', error.message);
    DeviceEventEmitter.emit('position-send-error', { error: error.message });
    return false;
  }
}

/**
 * Process queue and send latest location
 */
async function processQueueAndSend(latestPos: QueuedPosition): Promise<void> {
  let queue = await getOfflineQueue();
  const successfulIndices: number[] = [];

  console.log(`🔄 Background Queue: Processing queue (size: ${queue.length})`);

  for (let i = 0; i < queue.length; i++) {
    const queuedItem = queue[i];
    const sent = await sendPositionWithAuth(queuedItem);
    if (sent) {
      successfulIndices.push(i);
    } else {
      console.log('⚠️ Background Queue: Stopped queue processing due to failure');
      break;
    }
  }

  if (successfulIndices.length > 0) {
    queue = queue.filter((_, idx) => !successfulIndices.includes(idx));
    await saveOfflineQueue(queue);
    console.log(`🧹 Background Queue: Cleaned queue. Remaining size: ${queue.length}`);
  }

  if (queue.length > 0) {
    console.log('⏳ Background Queue: Queue not empty, appending latest point instead of direct send');
    await addToOfflineQueue(latestPos);
  } else {
    const sent = await sendPositionWithAuth(latestPos);
    if (!sent) {
      await addToOfflineQueue(latestPos);
    }
  }
}

async function checkBackgroundAlerts() {
  try {
    const response = await api.get('/api/delivery/detail', { timeout: 10000 });
    if (response.status === 200 && response.data?.data) {
      const delivery = response.data.data;
      const deliveryId = delivery.id;
      const currentAlerts = delivery.alerts || [];
      const currentTransits = delivery.transits || [];

      // 1. Check Alerts
      const alertStorageKey = `acknowledged_alerts_${deliveryId}`;
      const storedAlertStr = await AsyncStorage.getItem(alertStorageKey);
      const acknowledgedAlerts: Record<string, boolean> = storedAlertStr ? JSON.parse(storedAlertStr) : {};
      let alertUpdated = false;

      for (const alert of currentAlerts) {
        if (!acknowledgedAlerts[alert.id]) {
          const typeUpper = (alert.type || "").toUpperCase();
          let title = "";
          let body = "";

          if (typeUpper === "ILLEGAL_STOP") {
            title = "⚠️ Berhenti Ilegal Terdeteksi";
            body = "Anda terdeteksi berhenti di luar titik transit resmi untuk waktu yang lama.";
          } else if (typeUpper === "GPS_LOST") {
            title = "⚠️ GPS Terputus";
            body = "Sinyal GPS Anda terputus atau tidak terkirim selama lebih dari 10 menit.";
          }

          if (title) {
            await notifee.displayNotification({
              title,
              body,
              android: {
                channelId: 'delivery_alerts',
                importance: AndroidImportance.HIGH,
                pressAction: {
                  id: 'default',
                },
              },
            });
            acknowledgedAlerts[alert.id] = true;
            alertUpdated = true;
          }
        }
      }
      if (alertUpdated) {
        await AsyncStorage.setItem(alertStorageKey, JSON.stringify(acknowledgedAlerts));
      }

      // 2. Check Transits
      const transitStorageKey = `acknowledged_transits_${deliveryId}`;
      const storedTransitStr = await AsyncStorage.getItem(transitStorageKey);
      const acknowledgedTransits: Record<string, boolean> = storedTransitStr ? JSON.parse(storedTransitStr) : {};
      let transitUpdated = false;

      for (const currentTransit of currentTransits) {
        if (currentTransit.is_accepted !== null) {
          const key = `${currentTransit.id}_${currentTransit.is_accepted}`;
          if (!acknowledgedTransits[key]) {
            let title = "";
            let body = "";

            if (currentTransit.is_accepted === true) {
              title = "✅ Transit Disetujui";
              body = "Transit Anda menuju titik transit telah DISETUJUI oleh admin.";
            } else if (currentTransit.is_accepted === false) {
              title = "❌ Transit Ditolak";
              body = `Transit Anda menuju titik transit telah DITOLAK oleh admin. Alasan: ${currentTransit.reason || "-"}`;
            }

            if (title) {
              await notifee.displayNotification({
                title,
                body,
                android: {
                  channelId: 'delivery_alerts',
                  importance: AndroidImportance.HIGH,
                  pressAction: {
                    id: 'default',
                  },
                },
              });
              acknowledgedTransits[key] = true;
              transitUpdated = true;
            }
          }
        }
      }
      if (transitUpdated) {
        await AsyncStorage.setItem(transitStorageKey, JSON.stringify(acknowledgedTransits));
      }
    }
  } catch (err: any) {
    console.error('❌ Background Alert Check: Failed:', err.message);
  }
}

async function updateGpsWatchdog() {
  try {
    const deliveryId = await AsyncStorage.getItem('active_delivery_id');
    const isResting = await AsyncStorage.getItem('is_resting');

    if (!deliveryId || isResting === 'true') {
      await notifee.cancelNotification('gps_lost_watchdog');
      return;
    }

    // Determine interval threshold
    const demoMode = await AsyncStorage.getItem('demo_mode');
    const isDemo = demoMode === 'true';
    const thresholdSeconds = isDemo ? 20 : 600; // 20s for demo, 10m for normal

    // Schedule new watchdog notification using trigger
    await notifee.createTriggerNotification(
      {
        id: 'gps_lost_watchdog',
        title: '⚠️ GPS Terputus',
        body: `Sinyal GPS Anda terputus atau tidak terkirim selama lebih dari ${isDemo ? '15 detik' : '10 menit'}. Harap periksa koneksi GPS HP Anda.`,
        android: {
          channelId: 'delivery_alerts',
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
          },
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: Date.now() + (thresholdSeconds * 1000),
      }
    );

    console.log(`[Watchdog] Scheduled GPS Lost warning in ${thresholdSeconds}s via Notifee`);
  } catch (err: any) {
    console.error('❌ Watchdog: Failed to update GPS watchdog:', err.message);
  }
}

/**
 * Global Task Definition
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('❌ Background Task Error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const lastLocation = locations[locations.length - 1];

    if (lastLocation) {
      try {
        // 1. Enforce rate-limiting to match the configured activeInterval
        const activeIntervalVal = await AsyncStorage.getItem('active_interval');
        const activeInterval = activeIntervalVal ? parseInt(activeIntervalVal, 10) : 60000;
        
        const lastSentVal = await AsyncStorage.getItem('last_sent_timestamp');
        const lastSentSec = lastSentVal ? parseInt(lastSentVal, 10) : 0;

        const currentTimestamp = Math.floor(lastLocation.timestamp / 1000);
        const intervalSec = Math.floor(activeInterval / 1000);

        // Allow 1 second tolerance for OS scheduling jitter
        if (lastSentSec > 0 && (currentTimestamp - lastSentSec < intervalSec - 1)) {
          console.log(`⏳ Background: Skipping update, last sent only ${currentTimestamp - lastSentSec}s ago (required interval: ${intervalSec}s)`);
          // Periodic check alerts in background anyway
          try {
            await checkBackgroundAlerts();
          } catch (e: any) {
            console.error("❌ Background: checkBackgroundAlerts failed:", e.message);
          }
          try {
            await updateGpsWatchdog();
          } catch (e: any) {
            console.error("❌ Background: updateGpsWatchdog failed:", e.message);
          }
          return;
        }

        // Check Fake GPS
        if (lastLocation.mocked) {
          console.log('🚫 Background: Fake GPS detected, skipping send & raising alert');
          const deliveryId = await AsyncStorage.getItem('active_delivery_id');
          if (deliveryId) {
            api.post('/api/delivery/alert/send', {
              type: "FAKE_GPS",
              message: "Driver terdeteksi menggunakan aplikasi Fake GPS (Lokasi Palsu)!",
              delivery_id: deliveryId
            }, {
              timeout: 10000,
            }).then(() => {
              console.log("🚨 Background: FAKE_GPS Alert sent to backend successfully!");
            }).catch((err) => {
              console.error("❌ Background: Failed to send FAKE_GPS Alert:", err.message);
            });
          }
          try {
            await checkBackgroundAlerts();
          } catch (e: any) {
            console.error("❌ Background: checkBackgroundAlerts failed:", e.message);
          }
          try {
            await updateGpsWatchdog();
          } catch (e: any) {
            console.error("❌ Background: updateGpsWatchdog failed:", e.message);
          }
          return;
        }

        const payload: QueuedPosition = {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
          recorded_at: currentTimestamp,
        };

        console.log('📤 Background Task: New location received. Processing...', payload);
        try {
          await processQueueAndSend(payload);
        } catch (e: any) {
          console.error("❌ Background: processQueueAndSend failed:", e.message);
        }
        try {
          await checkBackgroundAlerts();
        } catch (e: any) {
          console.error("❌ Background: checkBackgroundAlerts failed:", e.message);
        }
        try {
          await updateGpsWatchdog();
        } catch (e: any) {
          console.error("❌ Background: updateGpsWatchdog failed:", e.message);
        }
      } catch (err: any) {
        console.error("❌ Background: Task processing crashed:", err.message);
      }
    }
  }
});

export class BackgroundLocationService {
  /**
   * Start background location tracking
   */
  static async start(options?: {
    accuracy?: Location.Accuracy;
    timeInterval?: number;
    distanceInterval?: number;
    forceRestart?: boolean;
  }): Promise<boolean> {
    try {
      console.log('🚀 Starting background location service...');

      // 1. Request foreground location permission
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.error('❌ Foreground location permission not granted');
        Alert.alert(
          "🚨 Akses Lokasi Diperlukan",
          "Harap izinkan akses lokasi di pengaturan ponsel Anda agar aplikasi bisa memantau pengiriman barang.",
          [
            { text: "Pengaturan", onPress: () => Linking.openSettings() },
            { text: "Batal", style: "cancel" }
          ]
        );
        return false;
      }

      // 2. Request background location permission
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.error('❌ Background location permission not granted');
        Alert.alert(
          "🚨 Akses Sepanjang Waktu Diperlukan",
          "Harap ubah izin lokasi menjadi 'Izinkan sepanjang waktu' (Allow all the time) agar pelacakan pengiriman tetap berfungsi saat layar mati atau aplikasi tertutup.",
          [
            { text: "Pengaturan", onPress: () => Linking.openSettings() },
            { text: "Batal", style: "cancel" }
          ]
        );
        return false;
      }

      // 3. Check Task Definition
      const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
      if (!isTaskDefined) {
        console.error('❌ Background task not defined');
        return false;
      }

      // 4. Check if already running (unless forceRestart is true)
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning && !options?.forceRestart) {
        console.log('⚠️ Background location already running');
        return true;
      }

      // 5. Start location updates
      const timeIntervalVal = options?.timeInterval || 60000;
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: options?.accuracy || Location.Accuracy.Balanced,
        timeInterval: timeIntervalVal,
        distanceInterval: options?.distanceInterval !== undefined ? options.distanceInterval : 0,
        deferredUpdatesInterval: timeIntervalVal,
        foregroundService: {
          notificationTitle: "Pelacakan pengiriman aktif",
          notificationBody: "Posisi truk dikirim secara berkala",
          notificationColor: "#2563EB",
        },
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
      });

      console.log('✅ Background location service configured & started successfully.');
      return true;
    } catch (error) {
      console.error('❌ Failed to start background location:', error);
      return false;
    }
  }

  /**
   * Stop background location tracking
   */
  static async stop(): Promise<boolean> {
    try {
      console.log('🛑 Stopping background location service...');

      // Cancel GPS lost watchdog notification
      try {
        await notifee.cancelNotification('gps_lost_watchdog');
      } catch (err) {
        console.error('❌ Failed to cancel watchdog on stop:', err);
      }

      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log('✅ Background location service stopped');
        return true;
      }
      console.log('⚠️ Background location was not running');
      return false;
    } catch (error) {
      console.error('❌ Failed to stop background location:', error);
      return false;
    }
  }

  /**
   * Send a single location update immediately (helper)
   */
  static async sendSingleUpdate(): Promise<boolean> {
    try {
      console.log('📤 Background: Sending instant single update...');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (location.mocked) {
        console.log('🚫 Background: Instant update: Fake GPS detected');
        return false;
      }

      const payload: PositionPayload = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        recorded_at: Math.floor(location.timestamp / 1000),
      };

      return await sendPositionWithAuth(payload);
    } catch (error: any) {
      console.error('❌ Background: Failed to send instant update:', error.message);
      return false;
    }
  }

  /**
   * Check if background location is currently running
   */
  static async isRunning(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (error) {
      console.error('❌ Failed to check background location status:', error);
      return false;
    }
  }

  /**
   * Get background location permissions status
   */
  static async checkPermissions(): Promise<{
    foreground: Location.PermissionStatus;
    background: Location.PermissionStatus;
  }> {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();

    return {
      foreground: foreground.status,
      background: background.status,
    };
  }
}

export { BACKGROUND_LOCATION_TASK };

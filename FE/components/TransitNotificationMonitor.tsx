import React, { useEffect } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDeliveryDetailsByWorker } from "@/hooks/useDelivery";
import { useCities } from "@/hooks/useTransit";
import notifee, { AndroidImportance } from "@notifee/react-native";

export default function TransitNotificationMonitor() {
  const { data: deliveryDetails } = useDeliveryDetailsByWorker({
    refetchInterval: 10000, // Poll every 10 seconds for real-time notifications
  });
  const { data: citiesData } = useCities();
  const cities = citiesData?.data || [];

  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        await notifee.requestPermission();
        await notifee.createChannel({
          id: "delivery_alerts",
          name: "Delivery Alerts",
          importance: AndroidImportance.HIGH,
          sound: "custom",
        });
      } catch (err) {
        console.error("Failed to request permission or create channel:", err);
      }
    };
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!deliveryDetails?.data || cities.length === 0) return;

    const currentTransits = deliveryDetails.data.transits || [];
    const currentAlerts = deliveryDetails.data.alerts || [];
    const deliveryId = deliveryDetails.data.id;

    const checkAndNotify = async () => {
      try {
        // 1. Check Transit Approvals/Rejections
        const transitStorageKey = `acknowledged_transits_${deliveryId}`;
        const storedTransitStr = await AsyncStorage.getItem(transitStorageKey);
        const acknowledgedTransits: Record<string, boolean> = storedTransitStr ? JSON.parse(storedTransitStr) : {};

        console.log(`[TransitMonitor] Checking transits and alerts for delivery ${deliveryId}`);

        let transitUpdated = false;

        for (const currentTransit of currentTransits) {
          if (currentTransit.is_accepted !== null) {
            const key = `${currentTransit.id}_${currentTransit.is_accepted}`;
            if (!acknowledgedTransits[key]) {
              const destinationCityId = currentTransit.transit_point?.unloading_city_id;
              const cityName = cities.find((c: any) => c.id === destinationCityId)?.name || "titik transit";

              console.log(`[TransitMonitor] New transit status: ${cityName}`);

              if (currentTransit.is_accepted === true) {
                Alert.alert(
                  "✅ Transit Disetujui",
                  `Transit Anda menuju ${cityName} telah DISETUJUI oleh admin. Silakan melanjutkan perjalanan.`
                );
                await notifee.displayNotification({
                  title: "✅ Transit Disetujui",
                  body: `Transit Anda menuju ${cityName} telah DISETUJUI oleh admin.`,
                  android: {
                    channelId: "delivery_alerts",
                    importance: AndroidImportance.HIGH,
                    pressAction: {
                      id: "default",
                    },
                  },
                });
              } else if (currentTransit.is_accepted === false) {
                Alert.alert(
                  "❌ Transit Ditolak",
                  `Transit Anda menuju ${cityName} telah DITOLAK oleh admin.\nAlasan: ${currentTransit.reason || "-"}`
                );
                await notifee.displayNotification({
                  title: "❌ Transit Ditolak",
                  body: `Transit Anda menuju ${cityName} telah DITOLAK oleh admin.`,
                  android: {
                    channelId: "delivery_alerts",
                    importance: AndroidImportance.HIGH,
                    pressAction: {
                      id: "default",
                    },
                  },
                });
              }

              acknowledgedTransits[key] = true;
              transitUpdated = true;
            }
          }
        }

        if (transitUpdated) {
          await AsyncStorage.setItem(transitStorageKey, JSON.stringify(acknowledgedTransits));
        }

        // 2. Check Delivery Alerts (ILLEGAL_STOP, GPS_LOST)
        const alertStorageKey = `acknowledged_alerts_${deliveryId}`;
        const storedAlertStr = await AsyncStorage.getItem(alertStorageKey);
        const acknowledgedAlerts: Record<string, boolean> = storedAlertStr ? JSON.parse(storedAlertStr) : {};

        let alertUpdated = false;

        for (const alert of currentAlerts) {
          if (!acknowledgedAlerts[alert.id]) {
            const typeUpper = (alert.type || "").toUpperCase();
            if (typeUpper === "ILLEGAL_STOP") {
              Alert.alert(
                "⚠️ Berhenti Ilegal Terdeteksi",
                "Anda terdeteksi berhenti di luar titik transit resmi untuk waktu yang lama.\n\nJika Anda sedang beristirahat atau ada kendala di jalan, harap aktifkan 'Mode Istirahat' di halaman utama agar tidak terkena peringatan anomali.",
                [{ text: "OK" }]
              );
              await notifee.displayNotification({
                title: "⚠️ Berhenti Ilegal Terdeteksi",
                body: "Anda terdeteksi berhenti di luar titik transit resmi untuk waktu yang lama.",
                android: {
                  channelId: "delivery_alerts",
                  importance: AndroidImportance.HIGH,
                  pressAction: {
                    id: "default",
                  },
                },
              });
              acknowledgedAlerts[alert.id] = true;
              alertUpdated = true;
            } else if (typeUpper === "GPS_LOST") {
              Alert.alert(
                "⚠️ GPS Terputus",
                "Sinyal GPS Anda terputus atau tidak terkirim selama lebih dari 10 menit. Harap periksa koneksi GPS HP Anda dan pastikan aplikasi memiliki izin lokasi sepanjang waktu.",
                [{ text: "OK" }]
              );
              await notifee.displayNotification({
                title: "⚠️ GPS Terputus",
                body: "Sinyal GPS Anda terputus atau tidak terkirim selama lebih dari 10 menit.",
                android: {
                  channelId: "delivery_alerts",
                  importance: AndroidImportance.HIGH,
                  pressAction: {
                    id: "default",
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

      } catch (e) {
        console.error("[TransitMonitor] Error checking notifications:", e);
      }
    };

    checkAndNotify();
  }, [deliveryDetails, cities]);

  return null;
}

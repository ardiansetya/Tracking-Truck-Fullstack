import React, { useEffect } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDeliveryDetailsByWorker } from "@/hooks/useDelivery";
import { useCities } from "@/hooks/useTransit";

export default function TransitNotificationMonitor() {
  const { data: deliveryDetails } = useDeliveryDetailsByWorker({
    refetchInterval: 10000, // Poll every 10 seconds for real-time notifications
  });
  const { data: citiesData } = useCities();
  const cities = citiesData?.data || [];

  useEffect(() => {
    if (!deliveryDetails?.data?.transits || cities.length === 0) return;

    const currentTransits = deliveryDetails.data.transits;
    const deliveryId = deliveryDetails.data.id;

    const checkAndNotify = async () => {
      try {
        const storageKey = `acknowledged_transits_${deliveryId}`;
        const storedStr = await AsyncStorage.getItem(storageKey);
        const acknowledgedMap: Record<string, boolean> = storedStr ? JSON.parse(storedStr) : {};

        console.log(`[TransitMonitor] Checking ${currentTransits.length} transits for delivery ${deliveryId}`);

        let updated = false;

        for (const currentTransit of currentTransits) {
          // Check if transit is accepted (true) or rejected (false)
          if (currentTransit.is_accepted !== null) {
            const key = `${currentTransit.id}_${currentTransit.is_accepted}`;

            // If we have not alerted the driver for this status yet
            if (!acknowledgedMap[key]) {
              const destinationCityId = currentTransit.transit_point?.unloading_city_id;
              const cityName = cities.find((c: any) => c.id === destinationCityId)?.name || "titik transit";

              console.log(`[TransitMonitor] New transit status detected! Showing alert for city: ${cityName}`);

              if (currentTransit.is_accepted === true) {
                Alert.alert(
                  "✅ Transit Disetujui",
                  `Transit Anda menuju ${cityName} telah DISETUJUI oleh admin. Silakan melanjutkan perjalanan.`
                );
              } else if (currentTransit.is_accepted === false) {
                Alert.alert(
                  "❌ Transit Ditolak",
                  `Transit Anda menuju ${cityName} telah DITOLAK oleh admin.\nAlasan: ${currentTransit.reason || "-"}`
                );
              }

              // Save seen status
              acknowledgedMap[key] = true;
              updated = true;
            }
          }
        }

        if (updated) {
          await AsyncStorage.setItem(storageKey, JSON.stringify(acknowledgedMap));
          console.log("[TransitMonitor] Saved acknowledged statuses to AsyncStorage.");
        }
      } catch (e) {
        console.error("[TransitMonitor] Error checking transit notifications:", e);
      }
    };

    checkAndNotify();
  }, [deliveryDetails, cities]);

  return null;
}

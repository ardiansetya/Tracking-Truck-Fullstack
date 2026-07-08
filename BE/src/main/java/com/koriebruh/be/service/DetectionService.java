package com.koriebruh.be.service;

import com.koriebruh.be.entity.*;
import com.koriebruh.be.entity.Enum.DeliverAlertType;
import com.koriebruh.be.repository.*;
import com.koriebruh.be.utils.GeoAPI;
import com.koriebruh.be.utils.GeoUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DetectionService {

    @Autowired
    private DeliveryRepository deliveryRepo;

    @Autowired
    private PositionRepository positionRepo;

    @Autowired
    private DeliverAlertRepository deliverAlertRepo;

    @Autowired
    private DeliveryTransitRepository deliveryTransitRepo;

    @Autowired
    private RouteRepository routeRepo;

    @Autowired
    private CityRepository cityRepo;

    @Autowired
    private GeoAPI geoAPI;

    @org.springframework.beans.factory.annotation.Value("${app.demo-mode:false}")
    private boolean demoMode;

    /**
     * Scheduled task to automatically detect and create alerts for:
     * 1. GPS_LOST - No GPS update in the last 10 minutes
     * 2. ILLEGAL_STOP - Vehicle stationary for 45+ minutes
     * 
     * Runs every 5 minutes.
     * When triggered, system automatically sends alert to admin and owner with general message
     * like "Vehicle stationary - possible puncture or busy traffic"
     */
    @Scheduled(fixedRateString = "${app.detection.rate:300000}") // Every 5 minutes default (or overridden by properties)
    public void detectIssues() {
        long now = Instant.now().getEpochSecond();
        List<Delivery> activeDeliveries = deliveryRepo.findAllByFinishedAtIsNull();

        for (Delivery delivery : activeDeliveries) {
            if (delivery.getIsResting() != null && delivery.getIsResting()) {
                continue;
            }
            boolean isDemo = delivery.getIsDemo() != null && delivery.getIsDemo();
            long gpsLostThreshold = isDemo ? 15 : 600; // 15 seconds vs 10 minutes
            long illegalStopThreshold = isDemo ? 30 : 2700; // 30 seconds vs 45 minutes

            Position latest = positionRepo.findTopByDeliveryIdOrderByRecordedAtDesc(delivery.getId());

            // 1. GPS LOST CHECK - No GPS update
            if (latest == null || latest.getRecordedAt() < now - gpsLostThreshold) {
                DeliverAlert recent = deliverAlertRepo.findTopByDeliveryIdAndTypeOrderByCreatedAtDesc(delivery.getId(), DeliverAlertType.GPS_LOST);
                if (recent == null || recent.getCreatedAt() < now - gpsLostThreshold) {
                    DeliverAlert alert = new DeliverAlert();
                    alert.setDelivery(delivery);
                    alert.setType(DeliverAlertType.GPS_LOST);
                    alert.setMessage("No GPS update in the last " + (gpsLostThreshold / 60 > 0 ? (gpsLostThreshold / 60) + " minutes" : gpsLostThreshold + " seconds") + ". Possible issue like puncture or busy traffic.");
                    alert.setCreatedAt(now);
                    deliverAlertRepo.save(alert);
                }
            }

            // 2. ILLEGAL STOP CHECK - GPS Location Based
            if (latest != null) {
                // Get position from threshold ago
                Position oldPosition = positionRepo.findTopByDeliveryIdAndRecordedAtLessThanEqualOrderByRecordedAtDesc(delivery.getId(), now - illegalStopThreshold);

                if (oldPosition != null) {
                    // Check if vehicle is still within 100 meter radius (stationary)
                    boolean stayingSameLocation = GeoUtils.isWithinRadius(
                            oldPosition.getLatitude(), oldPosition.getLongitude(),
                            latest.getLatitude(), latest.getLongitude(),
                            0.1 // 100 meter radius (~0.1 km)
                    );

                    if (stayingSameLocation) {
                        DeliverAlert recentLocationIllegal = deliverAlertRepo.findTopByDeliveryIdAndTypeOrderByCreatedAtDesc(delivery.getId(), DeliverAlertType.ILLEGAL_STOP);

                        if (recentLocationIllegal == null || recentLocationIllegal.getCreatedAt() < now - illegalStopThreshold) {
                            DeliverAlert locationIllegalAlert = new DeliverAlert();
                            locationIllegalAlert.setDelivery(delivery);
                            locationIllegalAlert.setType(DeliverAlertType.ILLEGAL_STOP);
                            
                            // Get readable address
                            String locationText;
                            try {
                                com.koriebruh.be.dto.LocationIQResponse res = geoAPI.reverseGeocode(latest.getLatitude(), latest.getLongitude());
                                locationText = (res != null && res.getDisplayName() != null) ? res.getDisplayName() : 
                                        String.format("(%.6f, %.6f)", latest.getLatitude(), latest.getLongitude());
                            } catch (Exception e) {
                                locationText = String.format("(%.6f, %.6f)", latest.getLatitude(), latest.getLongitude());
                            }

                            locationIllegalAlert.setMessage(String.format(
                                    "Vehicle stationary at same location for %d seconds. Possible puncture, busy traffic, or breakdown. Location: %s",
                                    illegalStopThreshold,
                                    locationText));
                            locationIllegalAlert.setCreatedAt(now);
                            deliverAlertRepo.save(locationIllegalAlert);
                        }
                    }
                }
            }
        }
    }
}

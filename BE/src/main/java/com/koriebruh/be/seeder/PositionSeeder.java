package com.koriebruh.be.seeder;

import com.koriebruh.be.entity.*;
import com.koriebruh.be.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
@Order(5)
public class PositionSeeder implements CommandLineRunner {

    @Autowired
    private DeliveryRepository deliveryRepository;

    @Autowired
    private PositionRepository positionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TruckRepository truckRepository;

    @Autowired
    private RouteRepository routeRepository;

    @Override
    public void run(String... args) throws Exception {
        log.info("Running dynamic PositionSeeder...");

        // If no deliveries exist at all, seed a completed one
        if (deliveryRepository.count() == 0) {
            log.info("Creating a completed test delivery...");
            Optional<User> driverOpt = userRepository.findByUsernameAndDeletedAtIsNull("driverandi");
            
            Optional<Truck> truckOpt = truckRepository.findAll().stream()
                    .filter(t -> t.getLicensePlate().equals("B 9012 GHI"))
                    .findFirst();

            Optional<Route> routeOpt = routeRepository.findAll().stream()
                    .filter(r -> r.getStartCity().getName().equals("Dieng") && r.getEndCity().getName().equals("Jakarta"))
                    .findFirst();
            
            Optional<User> adminOpt = userRepository.findByUsernameAndDeletedAtIsNull("adminapp");

            if (driverOpt.isPresent() && truckOpt.isPresent() && routeOpt.isPresent() && adminOpt.isPresent()) {
                Delivery delivery = new Delivery();
                delivery.setWorker(driverOpt.get());
                delivery.setTrucks(truckOpt.get());
                delivery.setRoute(routeOpt.get());
                delivery.setStartedAt(Instant.now().getEpochSecond() - 3600 * 5); // 5 hours ago
                delivery.setFinishedAt(Instant.now().getEpochSecond() - 3600 * 4); // 4 hours ago
                delivery.setAddByOperatorId(adminOpt.get());
                delivery.setIsResting(false);

                deliveryRepository.save(delivery);
                log.info("Test completed delivery created successfully!");
            } else {
                log.warn("Missing seeding dependencies: driver={}, truck={}, route={}, admin={}",
                        driverOpt.isPresent(), truckOpt.isPresent(), routeOpt.isPresent(), adminOpt.isPresent());
            }
        }

        // Seed position tracking points for all deliveries
        java.util.List<Delivery> allDeliveries = deliveryRepository.findAll();
        for (Delivery delivery : allDeliveries) {
            int count = positionRepository.findAllByDeliveryIdOrderByRecordedAtDesc(delivery.getId()).size();

            if (count <= 1) { // Only initial position or empty
                log.info("Seeding tracking positions for delivery: {}", delivery.getId());
                
                if (delivery.getRoute() == null || 
                    delivery.getRoute().getStartCity() == null || 
                    delivery.getRoute().getEndCity() == null) {
                    log.warn("Delivery {} has incomplete route information, skipping", delivery.getId());
                    continue;
                }

                double startLat = delivery.getRoute().getStartCity().getLatitude();
                double startLon = delivery.getRoute().getStartCity().getLongitude();
                double endLat = delivery.getRoute().getEndCity().getLatitude();
                double endLon = delivery.getRoute().getEndCity().getLongitude();

                int steps = 15;
                Long baseTime = delivery.getStartedAt();
                if (baseTime == null || baseTime == 0) {
                    baseTime = Instant.now().getEpochSecond() - 3600 * 5;
                }

                for (int i = 0; i < steps; i++) {
                    double fraction = (double) i / (steps - 1);
                    double lat = startLat + (endLat - startLat) * fraction;
                    double lon = startLon + (endLon - startLon) * fraction;

                    Position pos = new Position();
                    pos.setDelivery(delivery);
                    pos.setLatitude(lat);
                    pos.setLongitude(lon);
                    pos.setRecordedAt(baseTime + i * 60); // 60 seconds interval
                    positionRepository.save(pos);
                }
                log.info("Successfully seeded 15 tracking positions for delivery: {}", delivery.getId());
            } else {
                log.info("Positions already exist for delivery {}, skipping seeding", delivery.getId());
            }
        }
    }
}

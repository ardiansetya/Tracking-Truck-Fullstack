package com.koriebruh.be.entity.Enum;

import com.fasterxml.jackson.annotation.JsonValue;

public enum DeliverAlertType {
    TRANSIT,
    DELIVERY_COMPLETED,
    CANCELED,
    ILLEGAL_STOP,  // Berhenti terlalu lama di luar titik resmi (start, end, transit)
    UNAUTHORIZED_UNLOADING, // Diduga bongkar muatan ilegal
    IDLE_OUTSIDE_ALLOWED_AREA, // Diam terlalu lama di titik acak
    ROUTE_DEVIATION, // Menyimpang dari rute resmi
    GPS_LOST,
    FAKE_GPS,

    // Driver-initiated notifications
    TRAFFIC_DELAY,      // Heavy traffic causing delays
    PUNCTURE,           // Tire puncture
    BREAKDOWN,          // Vehicle mechanical failure
    FUEL_ISSUE,         // Running low on fuel
    ACCIDENT,           // Accident involved
    WEATHER_DELAY,      // Weather-related delays
    REST_START,         // Driver starts resting
    REST_END,           // Driver ends resting
    DRIVER_MESSAGE;     // Custom message from driver

    @Override
    @JsonValue // <-- ini buat JSON output (pakai Jackson)
    public String toString() {
        return name().toLowerCase(); // atau pakai kebab_case/snake_case custom di sini
    }
}

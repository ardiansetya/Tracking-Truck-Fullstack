package com.koriebruh.be.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "positions", indexes = {
    @Index(name = "idx_delivery_recorded", columnList = "delivery_id, recorded_at")
})
public class Position {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "delivery_id")
    private Delivery delivery;

    private Double latitude;

    private Double longitude;

    @Column(name = "recorded_at", nullable = false, updatable = false)
    private Long recordedAt;

    @Column(length = 500)
    private String name;

    @Column(name = "formatted_address", length = 1000)
    private String formattedAddress;

    private String city;

    private String state;

    private String country;
}

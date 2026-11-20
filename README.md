# 🚚 Tracking Truck — Fullstack Fleet Monitoring

Sistem manajemen dan monitoring armada truk berbasis GPS secara real-time. Proyek ini terdiri dari tiga aplikasi:

| Folder | Aplikasi | Pengguna | Stack |
|---|---|---|---|
| [`BE/`](BE) | REST API & mesin deteksi anomali | — | Java 17, Spring Boot 3.5, MySQL 8, JWT |
| [`next-truck/`](next-truck) | Dashboard web | Admin / Operator | Next.js 15, React 19, Tailwind 4, shadcn/ui, Leaflet |
| [`FE/`](FE) | Aplikasi mobile | Driver & Owner | Expo SDK 55, React Native 0.83, NativeWind, Notifee |

```
┌──────────────────────┐       ┌────────────────────────┐
│  Mobile App (FE)     │       │  Web Dashboard          │
│  Driver: kirim GPS   │       │  (next-truck)           │
│  Owner : pantau armada│      │  Admin: kelola & pantau │
└─────────┬────────────┘       └───────────┬────────────┘
          │  HTTPS + JWT (access/refresh)   │
          └──────────────┬──────────────────┘
                         ▼
              ┌──────────────────────┐      ┌───────────────┐
              │  Spring Boot API (BE)│◄────►│  MySQL 8      │
              │  + DetectionService  │      └───────────────┘
              │    (@Scheduled)      │      ┌───────────────┐
              └──────────────────────┘◄────►│  LocationIQ   │
                                            │  (geocoding)  │
                                            └───────────────┘
```

---

## ✨ Fitur Utama

### Pengiriman & Tracking
- Buat pengiriman dengan truk, driver, dan rute (kota asal → tujuan), lengkap dengan **estimasi durasi** otomatis (kecepatan urban/provinsi/tol, jeda istirahat tiap 4 jam, buffer 15%).
- Driver mengirim posisi GPS dari aplikasi mobile, **termasuk saat aplikasi ditutup** (background location + foreground service Android).
- Peta tracking real-time di web dan mobile (Leaflet / OpenStreetMap), riwayat posisi per pengiriman, dan posisi terakhir semua driver aktif.
- **Takeover**: ganti driver di tengah pengiriman, dengan riwayat serah terima.
- Riwayat pengiriman dan penyelesaian pengiriman (finish).

### Transit
- Master data **transit point** per rute.
- Driver mengajukan transit; admin **menerima atau menolak** (dengan alasan). Pengajuan tertunda dipantau secara polling.
- Mode istirahat driver (`REST_START` / `REST_END`) yang menjeda deteksi anomali.

### Deteksi Anomali Otomatis
`DetectionService` berjalan terjadwal untuk setiap pengiriman aktif:

| Alert | Kondisi | Threshold normal | Threshold demo |
|---|---|---|---|
| `GPS_LOST` | Tidak ada update GPS | 10 menit | 15 detik |
| `ILLEGAL_STOP` | Truk diam dalam radius 100 m | 45 menit | 30 detik |
| `FAKE_GPS` | Lokasi palsu (mock location) terdeteksi di HP driver | langsung | langsung |

Alert yang sama tidak dibuat ulang dalam jendela waktu tertentu (duplicate prevention). Skenario uji lengkap ada di [`BE/README.md`](BE/README.md).

### Notifikasi dari Driver
Driver dapat mengirim laporan manual: `TRAFFIC_DELAY`, `PUNCTURE`, `BREAKDOWN`, `FUEL_ISSUE`, `ACCIDENT`, `WEATHER_DELAY`, `DRIVER_MESSAGE`. Semua alert tampil di feed notifikasi dashboard web dan aplikasi owner (dengan suara kustom via Notifee). Detail: [`BE/NOTIFICATION_IMPLEMENTATION.md`](BE/NOTIFICATION_IMPLEMENTATION.md).

### Manajemen Data
CRUD truk (termasuk status maintenance & ketersediaan), driver/user, kota, rute, dan transit point. Autocomplete alamat, directions, dan map matching melalui proxy `/api/geo` ke LocationIQ.

### Autentikasi
- JWT **access token** (15 menit) + **refresh token** (90 hari), refresh otomatis di interceptor Axios web & mobile.
- Role: `OWNER`, `ADMIN`, `MODERATOR`, `DRIVER`.
- Ganti password, edit profil, dark mode.

---

## 📁 Struktur Repository

```
Tracking-Truck-Fullstack/
├── BE/                         # Spring Boot API
│   ├── src/main/java/com/koriebruh/be/
│   │   ├── config/             # SecurityConfig, JwtAuthenticationFilter
│   │   ├── controller/         # Auth, User, Truck, City, Route, TransitPoint, Delivery, Geo
│   │   ├── service/            # Business logic + DetectionService (scheduler)
│   │   ├── entity/             # JPA entity & enum (RoleType, DeliverAlertType)
│   │   ├── repository/         # Spring Data JPA
│   │   ├── seeder/             # Seeder user, truk, rute, posisi
│   │   ├── dto/                # Request/response
│   │   └── utils/              # JwtUtil, GeoUtils, Estimation, GeoAPI
│   ├── src/main/resources/     # application(-prod|-test).properties
│   ├── *.http                  # Contoh request per role (REST Client)
│   ├── schema.sql              # Dump skema database
│   ├── Dockerfile
│   └── docker-compose.yml      # MySQL + API + Traefik
├── next-truck/                 # Dashboard web (App Router)
│   └── src/
│       ├── app/(auth)/         # login, register
│       ├── app/(main)/         # beranda, pengiriman, rute, truk, driver, transit, profile
│       ├── components/         # shared/ & ui/ (shadcn)
│       ├── hooks/              # React Query hooks per domain
│       ├── schemas/            # Zod schema form
│       └── lib/axios.ts        # Axios + auto refresh token
└── FE/                         # Aplikasi mobile Expo
    ├── app/(auth)/             # login, register
    ├── app/(tabs)/driver/      # Home, Transit, Profile
    ├── app/(tabs)/owner/       # Home, Truck, Delivery, Profile
    ├── services/               # axios, backgroundLocationService, trackingStateService
    ├── hooks/                  # useLocation, usePositionTracker, useAuthenticatedTracking, ...
    ├── BACKGROUND_TRACKING.md
    └── AUTH_TRACKING_GUIDE.md
```

---

## 🚀 Menjalankan Proyek

### Prasyarat
- Java 17+ dan Maven (atau gunakan `./mvnw`)
- Node.js 20+ dan npm
- MySQL 8 (atau Docker)
- Android Studio / perangkat Android untuk build mobile (background location memerlukan native build, tidak bisa di Expo Go)
- API key [LocationIQ](https://locationiq.com) untuk geocoding

### 1. Backend (`BE/`)

**Opsi A — Docker Compose** (MySQL + API + Traefik):

```bash
cd BE
docker-compose up -d --build
```

API tersedia di `http://localhost:8080`, Traefik dashboard di `http://localhost:8081`. Profil `prod` dipakai di container.

**Opsi B — Lokal:**

1. Buat database `truck_management` di MySQL.
2. Sesuaikan `BE/src/main/resources/application.properties` (kredensial DB, `JWT_SECRET`, `geocoding.locationiq.key`).
3. Jalankan:

```bash
cd BE
./mvnw spring-boot:run
```

Tabel dibuat otomatis (`ddl-auto=update`) dan seeder mengisi data awal.

**Dokumentasi API:** Swagger UI di `http://localhost:8080/swagger-ui/index.html`. Health check: `/actuator/health`.

**Test:**

```bash
cd BE
./mvnw test
```

Test menggunakan H2 in-memory (`application-test.properties`).

### 2. Dashboard Web (`next-truck/`)

```bash
cd next-truck
npm install
```

Buat `next-truck/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

```bash
npm run dev
```

Buka `http://localhost:3000`.

### 3. Aplikasi Mobile (`FE/`)

```bash
cd FE
npm install
```

Buat `FE/.env`:

```env
# Gunakan IP LAN komputer, bukan localhost, saat memakai HP fisik
EXPO_PUBLIC_API_URL=http://192.168.x.x:8080
```

```bash
npx expo prebuild
npx expo run:android
```

Build APK via EAS (profil `preview` menghasilkan `.apk`):

```bash
eas build -p android --profile preview
```

Lihat [`FE/BACKGROUND_TRACKING.md`](FE/BACKGROUND_TRACKING.md) dan [`FE/AUTH_TRACKING_GUIDE.md`](FE/AUTH_TRACKING_GUIDE.md) untuk detail tracking latar belakang.

---

## ⚙️ Konfigurasi Penting

| Properti (`application.properties`) | Keterangan | Default |
|---|---|---|
| `JWT_SECRET` | Secret penandatanganan JWT | — |
| `spring.datasource.*` | Koneksi MySQL | `localhost:3306/truck_management` |
| `geocoding.locationiq.key` | API key LocationIQ | — |
| `app.demo-mode` | Mempersingkat threshold deteksi & memperpanjang token untuk demo | `false` |
| `app.detection.rate` | Interval `DetectionService` (ms) | `300000` (5 menit) |

Di profil `prod`, kredensial database dibaca dari environment variable `DB_USER` dan `DB_PASS`.

---

## 👤 Akun Seeder (Development)

| Role | Username | Password |
|---|---|---|
| OWNER | `ownerapp` | `owner2024` |
| ADMIN | `adminapp` | `admin123` |
| MODERATOR | `moderatorbudi` | `budi4567` |
| DRIVER | `driverandi` | `andi7890` |
| DRIVER | `driverbudi` | `budi1234` |

> Akun ini hanya untuk pengembangan lokal. Ganti atau nonaktifkan seeder sebelum deploy ke production.

---

## 🔌 Ringkasan Endpoint API

Semua endpoint `/api/**` membutuhkan header `Authorization: Bearer <access_token>`. Daftar lengkap tersedia di Swagger; contoh request per role ada di file `BE/*.http`.

| Grup | Endpoint |
|---|---|
| **Auth** | `POST /auth/login` · `POST /auth/register` · `GET /auth/validate` · `POST /auth/refresh-token` |
| **User** | `GET/POST /api/users` · `GET/PUT/DELETE /api/users/{id}` · `PATCH /api/users/profile/password` · `GET /api/users/drivers` · `GET /api/users/drivers/available` · `GET /api/users/operators` |
| **Truk** | `GET/POST /api/trucks` · `GET/PUT/DELETE /api/trucks/{id}` · `GET /api/trucks/available` · `PUT /api/trucks/maintenance/{id}` · `GET /api/trucks/toggle-availability/{id}` |
| **Kota** | `GET/POST /api/cities` · `GET/PUT/DELETE /api/cities/{id}` |
| **Rute** | `GET/POST /api/routes` · `GET/PUT/DELETE /api/routes/{id}` |
| **Transit Point** | `GET/POST /api/transit-points` · `GET/PUT/DELETE /api/transit-points/{id}` |
| **Pengiriman** | `POST /api/delivery` · `PATCH /api/delivery/finish/{id}` · `GET /api/delivery/active` · `GET /api/delivery/detail/{id}` · `GET /api/delivery/history` |
| **Posisi** | `POST /api/delivery/position` · `GET /api/delivery/positions/{deliveryId}` · `GET /api/delivery/positions/latest` |
| **Transit** | `POST /api/delivery/transit` · `GET /api/delivery/transit/pending` · `PATCH /api/delivery/transit/accept-or-reject` |
| **Takeover** | `POST /api/delivery/takeover` · `GET /api/delivery/takeover/{deliveryId}` |
| **Alert** | `POST /api/delivery/alert/send` · `GET /api/delivery/alert` · `POST /api/delivery/rest/toggle` |
| **Geo** | `GET /api/geo/autocomplete` · `GET /api/geo/directions` · `GET /api/geo/matching` |

---

## 🗄️ Model Data

Tabel utama (lihat [`BE/schema.sql`](BE/schema.sql)):

- `users` — pengguna dengan role
- `trucks` — armada truk
- `cities` — kota dengan koordinat
- `routes` — rute asal–tujuan
- `transit_points` — titik transit resmi per rute
- `deliveries` — pengiriman (truk, driver, rute, estimasi, status selesai)
- `positions` — titik GPS per pengiriman
- `delivery_transits` — pengajuan transit (diterima/ditolak)
- `deliver_alerts` — alert otomatis maupun dari driver
- `delivery_handovers` — riwayat takeover driver

---

## 🔐 Catatan Keamanan

Sebelum deploy ke production:
- Pindahkan `JWT_SECRET`, password database, dan API key LocationIQ/Geoapify dari file `.properties` ke environment variable atau secret manager, lalu rotasi nilai yang pernah ter-commit.
- Batasi `management.endpoints.web.exposure.include`. Saat ini endpoint actuator seperti `env`, `configprops`, dan `heapdump` terbuka tanpa autentikasi.
- Persempit CORS (`allowedOrigins("*")`) ke domain dashboard.
- Tutup Traefik dashboard (`--api.insecure=true`, port `8081`).

---

## 📄 Lisensi

Didistribusikan di bawah [MIT License](LICENSE).

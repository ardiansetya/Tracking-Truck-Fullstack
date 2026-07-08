import { z } from "zod";

export const createCitySchema = z.object({
  name: z.string().min(1, "Nama kota harus diisi"),
  latitude: z.number()
    .min(-90, "Latitude minimal -90")
    .max(90, "Latitude maksimal 90"),
  longitude: z.number()
    .min(-180, "Longitude minimal -180")
    .max(180, "Longitude maksimal 180"),
  country: z.string().min(1, "Negara harus diisi"),
});

export type CreateCityFormValues = z.infer<typeof createCitySchema>;

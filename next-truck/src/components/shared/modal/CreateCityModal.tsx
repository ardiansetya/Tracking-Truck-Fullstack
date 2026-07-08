"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateCity } from "@/hooks/useCity";
import {
  createCitySchema,
  CreateCityFormValues,
} from "@/schemas/CreateCitySchema";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { CityData } from "@/hooks/useCity";

interface CreateCityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (city: CityData) => void;
  initialSearchName?: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export default function CreateCityModal({
  open,
  onOpenChange,
  onSuccess,
  initialSearchName = "",
}: CreateCityModalProps) {
  const { mutate: createCity, isPending } = useCreateCity();
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [manualInput, setManualInput] = useState(false);

  const form = useForm<CreateCityFormValues>({
    resolver: zodResolver(createCitySchema),
    defaultValues: {
      name: initialSearchName,
      latitude: 0,
      longitude: 0,
      country: "Indonesia",
    },
  });

  const searchCityLocation = async () => {
    const cityName = form.getValues("name");
    if (!cityName.trim()) {
      toast.warning("Masukkan nama kota terlebih dahulu untuk dicari");
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          cityName
        )}&format=json&addressdetails=1&limit=3`,
        {
          headers: {
            "Accept-Language": "id,en",
          },
        }
      );
      const data = await response.json();
      setSuggestions(data);
      if (data.length === 0) {
        toast.info("Kota tidak ditemukan di OpenStreetMap. Gunakan opsi Input Manual.");
        setManualInput(true);
      } else {
        toast.success(`Ditemukan ${data.length} kecocokan lokasi`);
      }
    } catch (error) {
      console.error("OSM Geocoding Error:", error);
      toast.error("Gagal menghubungi layanan peta. Gunakan opsi Input Manual.");
      setManualInput(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const onSubmit = (values: CreateCityFormValues) => {
    createCity(values, {
      onSuccess: (response: any) => {
        // Parse ID from message, e.g. "City created successfully with ID: 12"
        const message = response.data;
        const match = typeof message === "string" ? message.match(/ID:\s*(\d+)/i) : null;
        const cityId = match ? parseInt(match[1], 10) : 0;

        const newCity: CityData = {
          id: cityId,
          name: values.name,
          latitude: values.latitude,
          longitude: values.longitude,
          country: values.country,
        };

        toast.success(typeof message === "string" ? message : "Kota berhasil ditambahkan");
        onOpenChange(false);
        form.reset();
        setSuggestions([]);
        setManualInput(false);
        if (onSuccess) {
          onSuccess(newCity);
        }
      },
      onError: (error) => {
        const errorMessage =
          error instanceof Error ? error.message : "Gagal menambahkan kota";
        toast.error(errorMessage);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Tambah Kota Baru</DialogTitle>
          <DialogDescription>
            Cari kota untuk mengisi koordinat secara otomatis
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-2 items-end">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Nama Kota</FormLabel>
                    <FormControl>
                      <Input placeholder="Contoh: Bandung" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={searchCityLocation}
                disabled={searchLoading}
              >
                {searchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-1" />
                )}
                Cari
              </Button>
            </div>
            {form.formState.errors.name && (
              <p className="text-sm text-red-500">
                {form.formState.errors.name.message}
              </p>
            )}

            {/* Suggestions list */}
            {suggestions.length > 0 && (
              <div className="border rounded-md bg-muted text-muted-foreground shadow-sm max-h-40 overflow-y-auto divide-y">
                {suggestions.map((s) => (
                  <button
                    key={s.place_id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => {
                      const latVal = parseFloat(s.lat);
                      const lonVal = parseFloat(s.lon);
                      const countryVal = s.address.country || "Indonesia";
                      const nameVal =
                        s.address.city ||
                        s.address.town ||
                        s.address.village ||
                        s.address.municipality ||
                        s.display_name.split(",")[0];

                      form.setValue("name", nameVal);
                      form.setValue("latitude", latVal);
                      form.setValue("longitude", lonVal);
                      form.setValue("country", countryVal);
                      setSuggestions([]);
                    }}
                  >
                    {s.display_name}
                  </button>
                ))}
              </div>
            )}

            {/* Manual Toggle */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="manual-input-checkbox"
                checked={manualInput}
                onChange={(e) => setManualInput(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="manual-input-checkbox" className="text-xs text-muted-foreground cursor-pointer select-none">
                Edit koordinat secara manual
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.000001"
                        placeholder="0.0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value) || 0)
                        }
                        disabled={!manualInput}
                      />
                    </FormControl>
                    {form.formState.errors.latitude && (
                      <p className="text-[10px] text-red-500">
                        {form.formState.errors.latitude.message}
                      </p>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.000001"
                        placeholder="0.0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value) || 0)
                        }
                        disabled={!manualInput}
                      />
                    </FormControl>
                    {form.formState.errors.longitude && (
                      <p className="text-[10px] text-red-500">
                        {form.formState.errors.longitude.message}
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Negara</FormLabel>
                  <FormControl>
                    <Input placeholder="Indonesia" {...field} disabled={!manualInput} />
                  </FormControl>
                  {form.formState.errors.country && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.country.message}
                    </p>
                  )}
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

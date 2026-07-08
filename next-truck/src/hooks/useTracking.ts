import axiosInstance from "@/lib/axios";
import { ApiResponse, Position } from "@/types/api";
import { useQuery } from "@tanstack/react-query";

// Get tracking positions by delivery ID
export const useTrackingPositions = (
  deliveryId: string,
  refetchInterval: number | false = 60000, // Default 60 seconds
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ["tracking", deliveryId],
    queryFn: async () => {
      const response = await axiosInstance.get<ApiResponse<Position[]>>(
        `/api/delivery/positions/${deliveryId}`
      );
      return response.data.data;
    },
    enabled: !!deliveryId && enabled,
    staleTime: 0, // Always consider data stale to allow immediate refetch
    refetchInterval: refetchInterval, // Dynamic auto-refetch interval
    refetchIntervalInBackground: true, // Continue refetching in background
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });
};

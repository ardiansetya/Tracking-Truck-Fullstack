"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteTransitPoint } from "@/hooks";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

interface AlertDeleteTransitPointProps {
  transitPointId: number;
}

const AlertDeleteTransitPoint = ({ transitPointId }: AlertDeleteTransitPointProps) => {
  const { mutate, isPending } = useDeleteTransitPoint();

  const handleDelete = () => {
    mutate(transitPointId, {
      onSuccess: () => {
        toast.success("Titik transit berhasil dihapus");
      },
      onError: (error) => {
        const axiosError = error as {
          response?: { data?: { message?: string } };
        };
        const errorMessage =
          axiosError.response?.data?.message || "Gagal menghapus titik transit";
        toast.error(errorMessage);
      },
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2Icon className="h-4 w-4" /> Hapus
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
          <AlertDialogDescription>
            Tindakan ini tidak dapat dibatalkan. Titik transit{" "}
            <span className="font-semibold">#{transitPointId}</span> akan dihapus
            secara permanen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-500 text-white"
            onClick={handleDelete}
            disabled={isPending}>
            {isPending ? "Menghapus..." : "Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AlertDeleteTransitPoint;

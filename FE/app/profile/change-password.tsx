import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ionicons } from "@expo/vector-icons";
import { useChangePassword } from "@/hooks/useProfile";

// Zod validation schema
const changePasswordSchema = z
  .object({
    old_password: z
      .string()
      .min(1, "Password lama tidak boleh kosong")
      .min(6, "Password minimal 6 karakter"),
    new_password: z
      .string()
      .min(1, "Password baru tidak boleh kosong")
      .min(6, "Password minimal 6 karakter"),
    confirm_password: z
      .string()
      .min(1, "Konfirmasi password tidak boleh kosong"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Konfirmasi password tidak cocok dengan password baru",
    path: ["confirm_password"],
  });

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

const ChangePassword = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const changePasswordMutation = useChangePassword();

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      old_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    try {
      await changePasswordMutation.mutateAsync({
        current_password: data.old_password,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      });

      Alert.alert("Sukses", "Password Anda berhasil diperbarui!", [
        {
          text: "OK",
          onPress: () => {
            reset();
            router.back();
          },
        },
      ]);
    } catch (error: any) {
      console.error("Change password error details:", error);
      const status = error.response?.status;
      let errorMsg = "Terjadi kesalahan saat mengubah password";
      
      if (status === 400) {
        errorMsg = "Password lama yang Anda masukkan salah";
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }

      Alert.alert("Gagal", errorMsg);
    }
  };

  const renderPasswordField = (
    name: keyof ChangePasswordFormData,
    label: string,
    placeholder: string,
    showState: boolean,
    setShowState: React.Dispatch<React.SetStateAction<boolean>>
  ) => (
    <View className="mb-6">
      <Text className="text-sm font-medium text-gray-700 mb-2">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <View className="relative">
            <View className="absolute left-4 top-4 z-10">
              <Ionicons name="lock-closed-outline" size={20} color="#6B7280" />
            </View>
            <TextInput
              className={`h-14 bg-gray-50 border rounded-xl pl-12 pr-12 text-gray-800 text-base ${
                errors[name]
                  ? "border-red-300 focus:border-red-500"
                  : "border-gray-200 focus:border-blue-500 focus:bg-white"
              }`}
              placeholder={placeholder}
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showState}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
            />
            <TouchableOpacity
              className="absolute right-4 top-4 z-10"
              onPress={() => setShowState(!showState)}>
              <Ionicons
                name={showState ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>
        )}
      />
      {errors[name] && (
        <Text className="text-red-500 text-sm mt-1">
          {errors[name]?.message}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top }} className="bg-gray-50">
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800">Ganti Password</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          paddingTop: 24,
        }}
        showsVerticalScrollIndicator={false}>
        
        <View className="items-center mb-8">
          <View className="w-20 h-20 rounded-full bg-blue-100 items-center justify-center mb-4">
            <Ionicons name="key" size={40} color="#2563EB" />
          </View>
          <Text className="text-lg font-semibold text-gray-800">
            Perbarui Password Akun
          </Text>
          <Text className="text-gray-500 text-sm text-center mt-1">
            Gunakan password yang kuat agar akun Anda tetap aman
          </Text>
        </View>

        {/* Form Card */}
        <View className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          {renderPasswordField(
            "old_password",
            "Password Lama",
            "Masukkan password lama Anda",
            showOldPassword,
            setShowOldPassword
          )}

          {renderPasswordField(
            "new_password",
            "Password Baru",
            "Masukkan password baru Anda (min. 6 karakter)",
            showNewPassword,
            setShowNewPassword
          )}

          {renderPasswordField(
            "confirm_password",
            "Konfirmasi Password Baru",
            "Ulangi password baru Anda",
            showConfirmPassword,
            setShowConfirmPassword
          )}

          {/* Submit Button */}
          <TouchableOpacity
            className={`h-14 rounded-xl justify-center items-center mt-4 shadow-sm ${
              changePasswordMutation.isPending
                ? "bg-gray-400"
                : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={handleSubmit(onSubmit)}
            disabled={changePasswordMutation.isPending}>
            <Text className="text-white font-semibold text-lg">
              {changePasswordMutation.isPending ? "Mengubah..." : "Ubah Password"}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

export default ChangePassword;

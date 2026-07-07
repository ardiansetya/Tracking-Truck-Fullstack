import z from "zod";

export const updateUserSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter"),
  email: z.email("Email tidak valid"),
  phone_number: z.string().min(10, "Nomor telepon minimal 10 digit"),
  age: z.number().min(17, "Usia minimal 17 tahun"),
});

export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

import { z } from 'zod';

export const logoutRequestDtoSchema = z.object({
  refresh_token_id: z.string().trim().min(1).optional(),
  fcm_token: z.string().trim().min(1).optional(),
});

export type LogoutRequestDto = z.infer<typeof logoutRequestDtoSchema>;

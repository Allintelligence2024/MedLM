import { z } from 'zod';

export const SignupBody = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(100).optional(),
  faculty: z.string().max(100).optional(),
  study_year: z.number().int().min(1).max(7).optional(),
});
export type SignupBody = z.infer<typeof SignupBody>;

export const LoginBody = z.object({
  email: z.string().email(),
});
export type LoginBody = z.infer<typeof LoginBody>;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_in: number;
}

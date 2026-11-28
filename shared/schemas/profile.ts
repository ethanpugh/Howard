import { z } from 'zod';
import { AppIdSchema, ProfileIdSchema } from './common.ts';

export const ProfileSchema = z.object({
  id: ProfileIdSchema,
  name: z.string(),
  role: z.string(),
  color: z.string(),
  badgeEmoji: z.string(),
  pinEnabled: z.boolean(),
  pin: z.string().optional().default(''),
  pinHash: z.string().optional(),
  lockedOutOfPin: z.boolean().optional(),
  allowedApps: z.array(AppIdSchema),
  caregiverName: z.string()
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PublicProfileSchema = z.object({
  id: ProfileIdSchema,
  name: z.string(),
  role: z.string(),
  color: z.string(),
  badgeEmoji: z.string(),
  pinEnabled: z.boolean(),
  lockedOutOfPin: z.boolean(),
  allowedApps: z.array(AppIdSchema),
  caregiverName: z.string()
});
export type PublicProfile = z.infer<typeof PublicProfileSchema>;

export const VerifyPinRequestSchema = z.object({
  profileId: ProfileIdSchema,
  pin: z.string().optional().default('')
});
export type VerifyPinRequest = z.infer<typeof VerifyPinRequestSchema>;

export const UpdatePinRequestSchema = z.object({
  profileId: ProfileIdSchema,
  currentPin: z.string().optional(),
  newPin: z.string().optional(),
  pinEnabled: z.boolean().optional().default(false)
});
export type UpdatePinRequest = z.infer<typeof UpdatePinRequestSchema>;

export const UpdateProfileNameRequestSchema = z.object({
  profileId: ProfileIdSchema,
  name: z.string().optional().default('')
});
export type UpdateProfileNameRequest = z.infer<typeof UpdateProfileNameRequestSchema>;

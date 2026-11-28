import { z } from 'zod';
import { isValidDateKey } from '../dateUtils.ts';

export const DateKeySchema = z
  .string()
  .refine(isValidDateKey, 'Expected valid calendar YYYY-MM-DD date');

export const ProfileIdSchema = z.enum(['partner1', 'partner2', 'caregiver']);
export type ProfileId = z.infer<typeof ProfileIdSchema>;

export const AppIdSchema = z.enum([
  'foyer',
  'cadence',
  'bloom',
  'almanac',
  'floodgate',
  'ledger',
  'quill',
  'beacon'
]);
export type AppId = z.infer<typeof AppIdSchema>;

export const ThemeModeSchema = z.enum(['warm', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const CaregiverItemSchema = z.object({
  profileId: ProfileIdSchema.nullable(),
  name: z.string()
});
export type CaregiverItem = z.infer<typeof CaregiverItemSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.string()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

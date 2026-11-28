import { z } from 'zod';
import { ProfileIdSchema } from './common.ts';

export const BeaconContactSchema = z.object({
  id: z.string(),
  profileId: ProfileIdSchema.nullable().optional(),
  name: z.string(),
  role: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().optional()
});
export type BeaconContact = z.infer<typeof BeaconContactSchema>;

export const BeaconPetCareSchema = z.object({
  summary: z.string(),
  feedingGuide: z.string(),
  carrierAndSupplies: z.string(),
  quirksAndNotes: z.string()
});
export type BeaconPetCare = z.infer<typeof BeaconPetCareSchema>;

export const BeaconVetInfoSchema = z.object({
  clinicName: z.string(),
  phone: z.string(),
  emergencyPhone: z.string(),
  address: z.string(),
  policyNumber: z.string(),
  notes: z.string()
});
export type BeaconVetInfo = z.infer<typeof BeaconVetInfoSchema>;

export const BeaconHouseGuideSchema = z.object({
  wifiName: z.string(),
  wifiPassword: z.string(),
  binDayInfo: z.string(),
  utilitiesInfo: z.string(),
  emergencyNotes: z.string()
});
export type BeaconHouseGuide = z.infer<typeof BeaconHouseGuideSchema>;

export const BeaconInfoSchema = z.object({
  petCare: BeaconPetCareSchema,
  vetInfo: BeaconVetInfoSchema,
  contacts: z.array(BeaconContactSchema),
  houseGuide: BeaconHouseGuideSchema
});
export type BeaconInfo = z.infer<typeof BeaconInfoSchema>;

export const BeaconPatchSchema = z.object({
  petCare: BeaconPetCareSchema.partial().optional(),
  vetInfo: BeaconVetInfoSchema.partial().optional(),
  contacts: z.array(BeaconContactSchema).optional(),
  houseGuide: BeaconHouseGuideSchema.partial().optional()
});
export type BeaconPatch = z.infer<typeof BeaconPatchSchema>;

export const BeaconPutRequestSchema = z.object({
  beaconInfo: BeaconPatchSchema.optional(),
  petCare: BeaconPetCareSchema.partial().optional(),
  vetInfo: BeaconVetInfoSchema.partial().optional(),
  contacts: z.array(BeaconContactSchema).optional(),
  houseGuide: BeaconHouseGuideSchema.partial().optional()
});
export type BeaconPutRequest = z.infer<typeof BeaconPutRequestSchema>;

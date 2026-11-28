import { z } from 'zod';

export const LedgerKindSchema = z.enum(['expense', 'recurring', 'income']);
export type LedgerKind = z.infer<typeof LedgerKindSchema>;

export const LedgerOwnerSchema = z.enum(['joint', 'partner1', 'partner2']);
export type LedgerOwner = z.infer<typeof LedgerOwnerSchema>;

export const LedgerSplitRuleSchema = z.enum(['50-50', 'proportional']);
export type LedgerSplitRule = z.infer<typeof LedgerSplitRuleSchema>;

export const LedgerScheduleCycleSchema = z.enum([
  'monthly',
  'annual',
  'quarterly',
  'weekly',
  'one-off'
]);
export type LedgerScheduleCycle = z.infer<typeof LedgerScheduleCycleSchema>;

export const LedgerRecurringTypeSchema = z.enum(['direct-debit', 'subscription']);
export type LedgerRecurringType = z.infer<typeof LedgerRecurringTypeSchema>;

export const LedgerItemSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1),
  amount: z.number().finite().min(0),
  owner: LedgerOwnerSchema.optional(),
  paidBy: LedgerOwnerSchema.optional(),
  type: LedgerRecurringTypeSchema.optional(),
  date: z.string().optional(),
  category: z.string().optional(),
  cycle: LedgerScheduleCycleSchema.optional(),
  frequency: LedgerScheduleCycleSchema.optional(),
  billingDay: z.union([z.number().finite(), z.string()]).optional(),
  billingWeekday: z.union([z.number().finite(), z.string()]).optional(),
  billingDate: z.string().optional(),
  payDay: z.union([z.number().finite(), z.string()]).optional(),
  payWeekday: z.union([z.number().finite(), z.string()]).optional(),
  payDate: z.string().optional(),
  active: z.boolean().optional(),
  note: z.string().optional(),
  notes: z.string().optional(),
  updatedAt: z.string().optional()
});
export type LedgerItem = z.infer<typeof LedgerItemSchema>;

export const LedgerItemPutRequestSchema = z.object({
  kind: LedgerKindSchema.optional(),
  item: LedgerItemSchema.partial({ id: true }).optional(),
  id: z.string().optional(),
  title: z.string().trim().min(1).optional(),
  amount: z.number().finite().min(0).optional(),
  owner: LedgerOwnerSchema.optional(),
  paidBy: LedgerOwnerSchema.optional(),
  type: LedgerRecurringTypeSchema.optional(),
  date: z.string().optional(),
  category: z.string().optional(),
  cycle: LedgerScheduleCycleSchema.optional(),
  frequency: LedgerScheduleCycleSchema.optional(),
  billingDay: z.union([z.number().finite(), z.string()]).optional(),
  billingWeekday: z.union([z.number().finite(), z.string()]).optional(),
  billingDate: z.string().optional(),
  payDay: z.union([z.number().finite(), z.string()]).optional(),
  payWeekday: z.union([z.number().finite(), z.string()]).optional(),
  payDate: z.string().optional(),
  active: z.boolean().optional(),
  note: z.string().optional(),
  notes: z.string().optional(),
  updatedAt: z.string().optional()
});
export type LedgerItemPutRequest = z.infer<typeof LedgerItemPutRequestSchema>;

export const LedgerDataSchema = z.object({
  splitRule: LedgerSplitRuleSchema,
  incomes: z.array(LedgerItemSchema),
  recurring: z.array(LedgerItemSchema),
  expenses: z.array(LedgerItemSchema)
});
export type LedgerData = z.infer<typeof LedgerDataSchema>;

export const LedgerDataPatchSchema = z.object({
  splitRule: LedgerSplitRuleSchema.optional(),
  incomes: z.array(LedgerItemSchema).optional(),
  recurring: z.array(LedgerItemSchema).optional(),
  expenses: z.array(LedgerItemSchema).optional()
});

export const LedgerReplacePutRequestSchema = z.object({
  ledgerData: LedgerDataPatchSchema.optional(),
  splitRule: LedgerSplitRuleSchema.optional(),
  incomes: z.array(LedgerItemSchema).optional(),
  recurring: z.array(LedgerItemSchema).optional(),
  expenses: z.array(LedgerItemSchema).optional()
});
export type LedgerReplacePutRequest = z.infer<typeof LedgerReplacePutRequestSchema>;

export const LedgerSettingsRequestSchema = z.object({
  splitRule: LedgerSplitRuleSchema
});
export type LedgerSettingsRequest = z.infer<typeof LedgerSettingsRequestSchema>;

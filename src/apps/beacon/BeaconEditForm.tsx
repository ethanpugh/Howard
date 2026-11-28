import { useId, useState, type FormEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { BeaconContact, BeaconInfo } from '../../../shared/schemas/beacon.ts';
import {
  SectionCard,
  StatusPill,
  SubSurface,
  getFieldClass
} from '../../components/HowardUI.tsx';
import { useActionLock } from '../../hooks/useActionLock.ts';
import { DEFAULT_BEACON_INFO } from '../../utils/householdHelpers.ts';

const LABEL_CLASS =
  'block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1';

type BeaconSectionKey = 'petCare' | 'vetInfo' | 'houseGuide';

export interface BeaconEditFormProps {
  initialDraft: BeaconInfo | null;
  isSaving: boolean;
  onSave: (cleanedBeacon: BeaconInfo) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Isolated edit form for Beacon guide so draft keystrokes never re-render the main view.
 */
export default function BeaconEditForm({
  initialDraft,
  isSaving,
  onSave,
  onCancel
}: BeaconEditFormProps) {
  const idPrefix = useId();
  const clinicNameId = `${idPrefix}-clinicName`;
  const vetPhoneId = `${idPrefix}-vetPhone`;
  const vetEmergencyPhoneId = `${idPrefix}-vetEmergencyPhone`;
  const vetAddressId = `${idPrefix}-vetAddress`;
  const policyNumberId = `${idPrefix}-policyNumber`;
  const feedingGuideId = `${idPrefix}-feedingGuide`;
  const carrierAndSuppliesId = `${idPrefix}-carrierAndSupplies`;
  const quirksAndNotesId = `${idPrefix}-quirksAndNotes`;
  const wifiNameId = `${idPrefix}-wifiName`;
  const wifiPasswordId = `${idPrefix}-wifiPassword`;
  const binDayInfoId = `${idPrefix}-binDayInfo`;
  const utilitiesInfoId = `${idPrefix}-utilitiesInfo`;
  const vetNotesId = `${idPrefix}-vetNotes`;
  const emergencyNotesId = `${idPrefix}-emergencyNotes`;

  const { isPending: isSubmitLocked, runLocked } = useActionLock();
  const submitDisabled = isSaving || isSubmitLocked;

  const [draft, setDraft] = useState<BeaconInfo>(() =>
    initialDraft
      ? {
          ...DEFAULT_BEACON_INFO,
          ...initialDraft,
          petCare: { ...DEFAULT_BEACON_INFO.petCare, ...initialDraft.petCare },
          vetInfo: { ...DEFAULT_BEACON_INFO.vetInfo, ...initialDraft.vetInfo },
          houseGuide: { ...DEFAULT_BEACON_INFO.houseGuide, ...initialDraft.houseGuide },
          contacts: Array.isArray(initialDraft.contacts) ? initialDraft.contacts : []
        }
      : {
          ...DEFAULT_BEACON_INFO,
          contacts: []
        }
  );

  if (!initialDraft) {
    return (
      <SectionCard aria-busy="true">
        <div className="py-8 flex items-center justify-center gap-2.5 text-sm font-semibold text-text-muted">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
          <span>Loading Beacon guide before editing...</span>
        </div>
      </SectionCard>
    );
  }

  const updateSectionField = <K extends BeaconSectionKey>(
    section: K,
    field: keyof BeaconInfo[K],
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  const updateContact = (index: number, patch: Partial<BeaconContact>) => {
    setDraft((prev) => {
      const next = [...(prev.contacts || [])];
      const existing = next[index];
      if (!existing) return prev;
      next[index] = { ...existing, ...patch };
      return { ...prev, contacts: next };
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!initialDraft || submitDisabled) return;
    await runLocked(async () => {
      const cleanedContacts = Array.isArray(draft.contacts)
        ? draft.contacts
            .filter(
              (c) =>
                (c?.name || '').trim() ||
                (c?.phone || '').trim() ||
                (c?.note || '').trim()
            )
            .map((c) => ({
              ...c,
              ...(Object.prototype.hasOwnProperty.call(c || {}, 'profileId')
                ? { profileId: c.profileId || null }
                : {})
            }))
        : [];
      await onSave({ ...draft, contacts: cleanedContacts });
    });
  };

  return (
    <SectionCard>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="text-base font-extrabold">Edit Beacon Guide</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={clinicNameId} className={LABEL_CLASS}>
            Vet Practice Name
          </label>
          <input
            id={clinicNameId}
            type="text"
            value={draft.vetInfo?.clinicName || ''}
            onChange={(e) => updateSectionField('vetInfo', 'clinicName', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={vetPhoneId} className={LABEL_CLASS}>
            Vet Daytime Phone
          </label>
          <input
            id={vetPhoneId}
            type="text"
            value={draft.vetInfo?.phone || ''}
            onChange={(e) => updateSectionField('vetInfo', 'phone', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={vetEmergencyPhoneId} className={LABEL_CLASS}>
            24hr Emergency Vet Phone
          </label>
          <input
            id={vetEmergencyPhoneId}
            type="text"
            value={draft.vetInfo?.emergencyPhone || ''}
            onChange={(e) => updateSectionField('vetInfo', 'emergencyPhone', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={vetAddressId} className={LABEL_CLASS}>
            Vet Address
          </label>
          <input
            id={vetAddressId}
            type="text"
            value={draft.vetInfo?.address || ''}
            onChange={(e) => updateSectionField('vetInfo', 'address', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={policyNumberId} className={LABEL_CLASS}>
            Pet Insurance Policy / Vet Account #
          </label>
          <input
            id={policyNumberId}
            type="text"
            value={draft.vetInfo?.policyNumber || ''}
            onChange={(e) => updateSectionField('vetInfo', 'policyNumber', e.target.value)}
            placeholder="Optional policy number or microchip reference"
            className={getFieldClass('sky')}
          />
        </div>
      </div>

      <div>
        <label htmlFor={feedingGuideId} className={LABEL_CLASS}>
          Pet Feeding &amp; Daily Routine
        </label>
        <textarea
          id={feedingGuideId}
          rows={2}
          value={draft.petCare?.feedingGuide || ''}
          onChange={(e) => updateSectionField('petCare', 'feedingGuide', e.target.value)}
          className={getFieldClass('sky')}
        />
      </div>

      <div>
        <label htmlFor={carrierAndSuppliesId} className={LABEL_CLASS}>
          Where Carriers, Enclosures, Syringes &amp; Supplies Are Kept
        </label>
        <textarea
          id={carrierAndSuppliesId}
          rows={2}
          value={draft.petCare?.carrierAndSupplies || ''}
          onChange={(e) => updateSectionField('petCare', 'carrierAndSupplies', e.target.value)}
          className={getFieldClass('sky')}
        />
      </div>

      <div>
        <label htmlFor={quirksAndNotesId} className={LABEL_CLASS}>
          Pet Quirks &amp; Notes
        </label>
        <textarea
          id={quirksAndNotesId}
          rows={2}
          value={draft.petCare?.quirksAndNotes || ''}
          onChange={(e) => updateSectionField('petCare', 'quirksAndNotes', e.target.value)}
          placeholder="Habits, personalities, enclosure/misting notes, or special care instructions..."
          className={getFieldClass('sky')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={wifiNameId} className={LABEL_CLASS}>
            Home Wi-Fi Network
          </label>
          <input
            id={wifiNameId}
            type="text"
            value={draft.houseGuide?.wifiName || ''}
            onChange={(e) => updateSectionField('houseGuide', 'wifiName', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={wifiPasswordId} className={LABEL_CLASS}>
            Wi-Fi Password / Note
          </label>
          <input
            id={wifiPasswordId}
            type="text"
            value={draft.houseGuide?.wifiPassword || ''}
            onChange={(e) => updateSectionField('houseGuide', 'wifiPassword', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={binDayInfoId} className={LABEL_CLASS}>
            Bin Collection Info
          </label>
          <input
            id={binDayInfoId}
            type="text"
            value={draft.houseGuide?.binDayInfo || ''}
            onChange={(e) => updateSectionField('houseGuide', 'binDayInfo', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>

        <div>
          <label htmlFor={utilitiesInfoId} className={LABEL_CLASS}>
            Utilities &amp; Stopcock / Fuse Box
          </label>
          <input
            id={utilitiesInfoId}
            type="text"
            value={draft.houseGuide?.utilitiesInfo || ''}
            onChange={(e) => updateSectionField('houseGuide', 'utilitiesInfo', e.target.value)}
            className={getFieldClass('sky')}
          />
        </div>
      </div>

      <div>
        <label htmlFor={vetNotesId} className={LABEL_CLASS}>
          Vet Emergency &amp; Insurance Notes
        </label>
        <textarea
          id={vetNotesId}
          rows={2}
          value={draft.vetInfo?.notes || ''}
          onChange={(e) => updateSectionField('vetInfo', 'notes', e.target.value)}
          className={getFieldClass('sky')}
        />
      </div>

      <div>
        <label htmlFor={emergencyNotesId} className={LABEL_CLASS}>
          Home Emergency &amp; Security Notes
        </label>
        <textarea
          id={emergencyNotesId}
          rows={2}
          value={draft.houseGuide?.emergencyNotes || ''}
          onChange={(e) => updateSectionField('houseGuide', 'emergencyNotes', e.target.value)}
          placeholder="Alarm code hints, spare key location, boiler reset instructions..."
          className={getFieldClass('sky')}
        />
      </div>

      <div className="space-y-2.5 pt-2 border-t border-border-subtle">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="block text-xs font-bold uppercase tracking-wider text-text-secondary">
            Household Emergency Contacts
          </span>
          <button
            type="button"
            onClick={() =>
              setDraft((prev) => ({
                ...prev,
                contacts: [
                  ...(prev.contacts || []),
                  { id: `c-${Date.now()}`, name: '', role: '', phone: '', note: '' }
                ]
              }))
            }
            className="bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold min-h-[40px] px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Contact</span>
          </button>
        </div>

        {(draft.contacts || []).map((contact, idx) => (
          <SubSurface key={contact.id || idx} className="p-3 space-y-2.5">
            {contact.profileId && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill accent="sky">Linked to Profile</StatusPill>
                <button
                  type="button"
                  onClick={() => updateContact(idx, { profileId: null })}
                  aria-label={`Unlink ${contact.name?.trim() || `contact ${idx + 1}`} from profile`}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border border-border-strong bg-surface-card text-text-primary hover:bg-surface-hover transition active:scale-[0.98] cursor-pointer"
                >
                  Unlink
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 lg:gap-2 items-center">
              <input
                type="text"
                value={contact.name || ''}
                onChange={(e) => updateContact(idx, { name: e.target.value })}
                placeholder="Name"
                aria-label={`Contact ${idx + 1} name`}
                className={getFieldClass('sky', 'lg:col-span-3')}
              />
              <input
                type="text"
                value={contact.role || ''}
                onChange={(e) => updateContact(idx, { role: e.target.value })}
                placeholder="Role (e.g. Member / Neighbour)"
                aria-label={`Contact ${idx + 1} role`}
                className={getFieldClass('sky', 'lg:col-span-2')}
              />
              <input
                type="text"
                value={contact.phone || ''}
                onChange={(e) => updateContact(idx, { phone: e.target.value })}
                placeholder="Phone Number"
                aria-label={`Contact ${idx + 1} phone`}
                className={getFieldClass('sky', 'lg:col-span-3')}
              />
              <input
                type="text"
                value={contact.note || ''}
                onChange={(e) => updateContact(idx, { note: e.target.value })}
                placeholder="Note (e.g., WhatsApp anytime)"
                aria-label={`Contact ${idx + 1} note`}
                className={getFieldClass('sky', 'lg:col-span-3')}
              />
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    contacts: (prev.contacts || []).filter((_, i) => i !== idx)
                  }))
                }
                className="sm:col-span-2 lg:col-span-1 w-full lg:w-auto min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] p-2 rounded-xl text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 border lg:border-0 border-border-strong flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition active:scale-[0.98]"
                title="Remove contact"
                aria-label={`Remove contact ${idx + 1}`}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="lg:hidden">Remove Contact</span>
              </button>
            </div>
          </SubSurface>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={submitDisabled}
          onClick={onCancel}
          className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle hover:bg-surface-hover text-text-primary transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold bg-sky-700 hover:bg-sky-800 text-white inline-flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{submitDisabled ? 'Saving...' : 'Save Beacon Guide'}</span>
        </button>
      </div>
      </form>
    </SectionCard>
  );
}

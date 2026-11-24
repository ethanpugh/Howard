import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Cat,
  Flower2,
  Phone,
  Stethoscope,
  Wifi,
  Copy,
  Edit3,
  Check,
  Plus,
  Trash2
} from 'lucide-react';
import { copyTextToClipboard } from '../utils/householdHelpers.js';
import { MODULE_ACCENTS, ModuleHeader, EmptyStateCard, getFieldClass } from '../components/HowardUI.jsx';

export default function BeaconApp({
  activeProfile,
  darkMode,
  beaconInfo,
  cadenceSettings,
  bloomSnapshot,
  onSaveBeacon,
  onNavigateApp,
  showToast
}) {
  const canEdit = activeProfile.id !== 'caregiver';
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(beaconInfo || {});
  const [copiedKey, setCopiedKey] = useState(null);
  const copyTimeoutRef = useRef(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (beaconInfo && !isEditing) {
      setDraft(beaconInfo);
    }
  }, [beaconInfo, isEditing]);

  useEffect(() => {
    if (!canEdit && isEditing) {
      setIsEditing(false);
    }
  }, [canEdit, isEditing]);

  const catName = cadenceSettings?.catName || 'Pet';
  const bloomSettings = bloomSnapshot?.settings || {};
  const mantisName = bloomSettings.mantisName || 'Mantis';

  const handleCopyValue = async (key, value, label) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    const ok = await copyTextToClipboard(trimmed);
    if (ok) {
      setCopiedKey(key);
      if (showToast) showToast(`Copied ${label} to clipboard`);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedKey(null), 2000);
    } else if (showToast) {
      showToast(`Could not copy ${label.toLowerCase()} automatically`, 'error');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEdit || isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
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
      const ok = await onSaveBeacon({ ...draft, contacts: cleanedContacts });
      if (ok !== false) {
        setIsEditing(false);
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* HEADER */}
      <ModuleHeader
        accent="sky"
        icon={ShieldAlert}
        title="Beacon • Emergency, Vet & House Guide"
        subtitle="Everything a pet sitter, guest, or household member needs for the pets and the house"
        darkMode={darkMode}
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigateApp('cadence')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
              title={`Open ${catName}'s Medicine (Cadence)`}
            >
              <Cat className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Cadence</span>
              <span className="hidden sm:inline">{catName} (Cadence)</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateApp('bloom')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
              title={`Open ${mantisName}'s Habitat & Care (Bloom)`}
            >
              <Flower2 className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Bloom</span>
              <span className="hidden sm:inline">{mantisName} (Bloom)</span>
            </button>
            {canEdit && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setDraft(beaconInfo || {});
                  setIsEditing(!isEditing);
                }}
                aria-pressed={isEditing}
                className={`min-w-[44px] min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  isEditing
                    ? 'bg-sky-700 hover:bg-sky-800 border-sky-700 text-white shadow-xs'
                    : darkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-sky-500/50'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-800'
                }`}
                title={isEditing ? 'Cancel Edit' : 'Edit Guide'}
                aria-label={isEditing ? 'Cancel Edit' : 'Edit Guide'}
              >
                <Edit3 className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{isEditing ? 'Cancel Edit' : 'Edit Guide'}</span>
              </button>
            )}
          </>
        }
      />

      {isEditing && canEdit ? (
        <form
          onSubmit={handleSave}
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
          }`}
        >
          <h3 className="text-base font-extrabold">Edit Beacon Guide</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Vet Practice Name
              </label>
              <input
                type="text"
                value={draft.vetInfo?.clinicName || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vetInfo: { ...draft.vetInfo, clinicName: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Vet Daytime Phone
              </label>
              <input
                type="text"
                value={draft.vetInfo?.phone || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vetInfo: { ...draft.vetInfo, phone: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                24hr Emergency Vet Phone
              </label>
              <input
                type="text"
                value={draft.vetInfo?.emergencyPhone || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vetInfo: { ...draft.vetInfo, emergencyPhone: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Vet Address
              </label>
              <input
                type="text"
                value={draft.vetInfo?.address || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vetInfo: { ...draft.vetInfo, address: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Pet Insurance Policy / Vet Account #
              </label>
              <input
                type="text"
                value={draft.vetInfo?.policyNumber || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vetInfo: { ...draft.vetInfo, policyNumber: e.target.value }
                  })
                }
                placeholder="Optional policy number or microchip reference"
                className={getFieldClass('sky')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Pet Feeding &amp; Daily Routine
            </label>
            <textarea
              rows={2}
              value={draft.petCare?.feedingGuide || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  petCare: { ...draft.petCare, feedingGuide: e.target.value }
                })
              }
              className={getFieldClass('sky')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Where Carriers, Enclosures, Syringes &amp; Supplies Are Kept
            </label>
            <textarea
              rows={2}
              value={draft.petCare?.carrierAndSupplies || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  petCare: { ...draft.petCare, carrierAndSupplies: e.target.value }
                })
              }
              className={getFieldClass('sky')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Pet Quirks &amp; Notes
            </label>
            <textarea
              rows={2}
              value={draft.petCare?.quirksAndNotes || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  petCare: { ...draft.petCare, quirksAndNotes: e.target.value }
                })
              }
              placeholder="Habits, personalities, enclosure/misting notes, or special care instructions..."
              className={getFieldClass('sky')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Home Wi-Fi Network
              </label>
              <input
                type="text"
                value={draft.houseGuide?.wifiName || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    houseGuide: { ...draft.houseGuide, wifiName: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Wi-Fi Password / Note
              </label>
              <input
                type="text"
                value={draft.houseGuide?.wifiPassword || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    houseGuide: { ...draft.houseGuide, wifiPassword: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Bin Collection Info
              </label>
              <input
                type="text"
                value={draft.houseGuide?.binDayInfo || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    houseGuide: { ...draft.houseGuide, binDayInfo: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Utilities &amp; Stopcock / Fuse Box
              </label>
              <input
                type="text"
                value={draft.houseGuide?.utilitiesInfo || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    houseGuide: { ...draft.houseGuide, utilitiesInfo: e.target.value }
                  })
                }
                className={getFieldClass('sky')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Vet Emergency &amp; Insurance Notes
            </label>
            <textarea
              rows={2}
              value={draft.vetInfo?.notes || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  vetInfo: { ...draft.vetInfo, notes: e.target.value }
                })
              }
              className={getFieldClass('sky')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Home Emergency &amp; Security Notes
            </label>
            <textarea
              rows={2}
              value={draft.houseGuide?.emergencyNotes || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  houseGuide: { ...draft.houseGuide, emergencyNotes: e.target.value }
                })
              }
              placeholder="Alarm code hints, spare key location, boiler reset instructions..."
              className={getFieldClass('sky')}
            />
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Household Emergency Contacts
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    contacts: [
                      ...(draft.contacts || []),
                      { id: `c-${Date.now()}`, name: '', role: '', phone: '', note: '' }
                    ]
                  })
                }
                className="bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold min-h-[40px] px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Add Contact</span>
              </button>
            </div>
            {(draft.contacts || []).map((contact, idx) => (
              <div
                key={contact.id || idx}
                className={`p-3 rounded-2xl border space-y-2.5 ${
                  darkMode
                    ? 'bg-slate-800/40 border-slate-700'
                    : 'bg-slate-50/80 border-slate-200/90'
                }`}
              >
                {contact.profileId && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/25">
                      Linked to Profile
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...(draft.contacts || [])];
                        next[idx] = { ...next[idx], profileId: null };
                        setDraft({ ...draft, contacts: next });
                      }}
                      aria-label={`Unlink ${contact.name?.trim() || `contact ${idx + 1}`} from profile`}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-[0.98] cursor-pointer ${
                        darkMode
                          ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Unlink
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 lg:gap-2 items-center">
                  <input
                    type="text"
                    value={contact.name || ''}
                    onChange={(e) => {
                      const next = [...(draft.contacts || [])];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setDraft({ ...draft, contacts: next });
                    }}
                    placeholder="Name"
                    aria-label={`Contact ${idx + 1} name`}
                    className={getFieldClass('sky', 'lg:col-span-3')}
                  />
                  <input
                    type="text"
                    value={contact.role || ''}
                    onChange={(e) => {
                      const next = [...(draft.contacts || [])];
                      next[idx] = { ...next[idx], role: e.target.value };
                      setDraft({ ...draft, contacts: next });
                    }}
                    placeholder="Role (e.g. Member / Neighbour)"
                    aria-label={`Contact ${idx + 1} role`}
                    className={getFieldClass('sky', 'lg:col-span-2')}
                  />
                  <input
                    type="text"
                    value={contact.phone || ''}
                    onChange={(e) => {
                      const next = [...(draft.contacts || [])];
                      next[idx] = { ...next[idx], phone: e.target.value };
                      setDraft({ ...draft, contacts: next });
                    }}
                    placeholder="Phone Number"
                    aria-label={`Contact ${idx + 1} phone`}
                    className={getFieldClass('sky', 'lg:col-span-3')}
                  />
                  <input
                    type="text"
                    value={contact.note || ''}
                    onChange={(e) => {
                      const next = [...(draft.contacts || [])];
                      next[idx] = { ...next[idx], note: e.target.value };
                      setDraft({ ...draft, contacts: next });
                    }}
                    placeholder="Note (e.g., WhatsApp anytime)"
                    aria-label={`Contact ${idx + 1} note`}
                    className={getFieldClass('sky', 'lg:col-span-3')}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        contacts: (draft.contacts || []).filter((_, i) => i !== idx)
                      })
                    }
                    className="sm:col-span-2 lg:col-span-1 w-full lg:w-auto min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 border lg:border-0 border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition active:scale-[0.98]"
                    title="Remove contact"
                    aria-label={`Remove contact ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span className="lg:hidden">Remove Contact</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setIsEditing(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold bg-sky-700 hover:bg-sky-800 text-white inline-flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{isSaving ? 'Saving...' : 'Save Beacon Guide'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* 1. PET CARE & MEDICATION INSTRUCTIONS */}
          <section
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3.5 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.purple.iconBg}`}
              >
                <Cat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold">Pet Care</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Feeding, supplies &amp; {catName}&apos;s prescribed{' '}
                  {cadenceSettings?.medicationName || 'Oral Solution'} (
                  {cadenceSettings?.dosageLabel || '2.5 mg / 0.5 ml'})
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm">
              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-purple-50/50 border-purple-200/70'
                }`}
              >
                <div className="font-bold text-purple-700 dark:text-purple-300 mb-1">
                  💊 {catName}&apos;s Medication Schedule (~
                  {cadenceSettings?.morningTargetTime || '08:00'} &amp; ~
                  {cadenceSettings?.eveningTargetTime || '20:00'})
                </div>
                <p className="leading-relaxed">
                  {cadenceSettings?.administrationNote || beaconInfo?.petCare?.summary}
                </p>
              </div>

              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-emerald-50/60 border-emerald-200/80'
                }`}
              >
                <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  🌸 {mantisName} ({bloomSettings.commonName || 'Spiny Flower Mantis'} •{' '}
                  {bloomSettings.currentInstar || 'L2'})
                </div>
                <p className="leading-relaxed">
                  {bloomSettings.careNote ||
                    'Mist one enclosure wall lightly once daily for drinking droplets; never feed live prey during Premolt Watch or Post-Molt Hardening.'}
                </p>
              </div>

              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🍽️ Feeding Routine</div>
                <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                  {beaconInfo?.petCare?.feedingGuide || 'No feeding guide entered yet.'}
                </p>
              </div>

              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🧰 Carrier &amp; Medicine Supplies</div>
                <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                  {beaconInfo?.petCare?.carrierAndSupplies || 'No supply locations entered yet.'}
                </p>
              </div>

              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🐾 Pet Quirks &amp; Notes</div>
                <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                  {beaconInfo?.petCare?.quirksAndNotes || 'No extra pet notes entered yet.'}
                </p>
              </div>
            </div>
          </section>

          {/* 2. EMERGENCY VET, HOUSEHOLD CONTACTS & UTILITIES */}
          <section
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3.5 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.rose.iconBg}`}
              >
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold">
                  Veterinary Clinic &amp; Emergency Contacts
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap any phone number to call or copy directly
                </p>
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl sm:rounded-2xl border space-y-2 text-xs sm:text-sm ${
                darkMode ? 'bg-rose-950/20 border-rose-800/60' : 'bg-rose-50/50 border-rose-200'
              }`}
            >
              <div className="font-extrabold text-base">
                {beaconInfo?.vetInfo?.clinicName?.trim() || 'Veterinary Clinic not set'}
              </div>
              {beaconInfo?.vetInfo?.address?.trim() && (
                <div>📍 {beaconInfo.vetInfo.address.trim()}</div>
              )}
              {beaconInfo?.vetInfo?.policyNumber?.trim() && (
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Policy / Account #: {beaconInfo.vetInfo.policyNumber.trim()}
                </div>
              )}
              {(beaconInfo?.vetInfo?.phone?.trim() ||
                beaconInfo?.vetInfo?.emergencyPhone?.trim()) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {beaconInfo?.vetInfo?.phone?.trim() && (
                    <div className="inline-flex flex-wrap items-center gap-1.5 max-w-full">
                      <a
                        href={`tel:${beaconInfo.vetInfo.phone.trim()}`}
                        className="min-h-[40px] min-w-0 max-w-full break-all px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-bold text-xs inline-flex items-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="min-w-0 break-all">
                          Daytime: {beaconInfo.vetInfo.phone.trim()}
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyValue('vet-daytime', beaconInfo.vetInfo.phone, 'daytime vet number')
                        }
                        className={`min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center shrink-0 transition active:scale-[0.98] cursor-pointer ${
                          copiedKey === 'vet-daytime'
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : darkMode
                              ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Copy Daytime Vet Number"
                        aria-label="Copy Daytime Vet Number"
                      >
                        {copiedKey === 'vet-daytime' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                  {beaconInfo?.vetInfo?.emergencyPhone?.trim() && (
                    <div className="inline-flex flex-wrap items-center gap-1.5 max-w-full">
                      <a
                        href={`tel:${beaconInfo.vetInfo.emergencyPhone.trim()}`}
                        className="min-h-[40px] min-w-0 max-w-full break-all px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="min-w-0 break-all">
                          Emergency: {beaconInfo.vetInfo.emergencyPhone.trim()}
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyValue(
                            'vet-emergency',
                            beaconInfo.vetInfo.emergencyPhone,
                            'emergency vet number'
                          )
                        }
                        className={`min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center shrink-0 transition active:scale-[0.98] cursor-pointer ${
                          copiedKey === 'vet-emergency'
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : darkMode
                              ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Copy Emergency Vet Number"
                        aria-label="Copy Emergency Vet Number"
                      >
                        {copiedKey === 'vet-emergency' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {beaconInfo?.vetInfo?.notes?.trim() && (
                <p className="text-xs pt-2 border-t border-rose-500/20 text-slate-700 dark:text-slate-200">
                  {beaconInfo.vetInfo.notes}
                </p>
              )}
            </div>

            {/* Household Contact Cards */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Household Contacts
              </div>
              {(beaconInfo?.contacts || []).length > 0 ? (
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5">
                  {(beaconInfo?.contacts || []).map((c, idx) => {
                    const contactCopyId = `contact-${c.id || idx}`;
                    const isCopied = copiedKey === contactCopyId;
                    return (
                      <div
                        key={c.id || idx}
                        className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2.5 ${
                          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1 basis-[150px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm truncate">
                              {c.name?.trim() || 'Household Contact'}
                            </span>
                            {c.role?.trim() && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/25 shrink-0">
                                {c.role.trim()}
                              </span>
                            )}
                          </div>
                          {c.note?.trim() && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {c.note}
                            </div>
                          )}
                        </div>
                        {c.phone?.trim() ? (
                          <div className="flex flex-wrap items-center gap-1.5 max-w-full min-w-0">
                            <a
                              href={`tel:${c.phone.trim()}`}
                              className="bg-sky-700 hover:bg-sky-800 text-white min-h-[40px] min-w-0 max-w-full break-all px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition active:scale-[0.98]"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span className="min-w-0 break-all">{c.phone.trim()}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyValue(
                                  contactCopyId,
                                  c.phone,
                                  `${c.name?.trim() || 'contact'}'s number`
                                )
                              }
                              className={`min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center shrink-0 transition active:scale-[0.98] cursor-pointer ${
                                isCopied
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : darkMode
                                    ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                              title={`Copy ${c.name?.trim() || 'contact'}'s phone number`}
                              aria-label={`Copy ${c.name?.trim() || 'contact'}'s phone number`}
                            >
                              {isCopied ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400 italic shrink-0">
                            No number
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyStateCard
                  accent="sky"
                  darkMode={darkMode}
                  icon={Phone}
                  title="No household contacts yet"
                  description="No household emergency contacts entered yet."
                  className="p-4 sm:p-5"
                />
              )}
            </div>

            {/* Structured Home Wi-Fi & Utilities Sub-Cards */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>Home Wi-Fi &amp; Utilities</span>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                <div
                  className={`p-3.5 rounded-2xl border space-y-1 ${
                    darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Wi-Fi Network (SSID)
                  </div>
                  <div className="font-extrabold text-sm break-all">
                    {beaconInfo?.houseGuide?.wifiName || 'Not set'}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
                    darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Wi-Fi Password
                    </div>
                    <div className="font-mono font-bold text-xs sm:text-sm break-all text-sky-700 dark:text-sky-300">
                      {beaconInfo?.houseGuide?.wifiPassword || 'Not set'}
                    </div>
                  </div>
                  {beaconInfo?.houseGuide?.wifiPassword && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyValue('wifi', beaconInfo.houseGuide.wifiPassword, 'Wi-Fi password')
                      }
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition active:scale-[0.98] cursor-pointer ${
                        copiedKey === 'wifi'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : darkMode
                            ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Copy Wi-Fi Password"
                    >
                      {copiedKey === 'wifi' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div
                className={`p-3.5 rounded-2xl border text-xs sm:text-sm ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🗑️ Bin Collection</div>
                <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                  {beaconInfo?.houseGuide?.binDayInfo || 'No bin collection details entered yet.'}
                </p>
              </div>

              <div
                className={`p-3.5 rounded-2xl border text-xs sm:text-sm ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🔧 Utilities, Stopcock &amp; Fuse Box</div>
                <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                  {beaconInfo?.houseGuide?.utilitiesInfo || 'No utilities info entered yet.'}
                </p>
              </div>

              {beaconInfo?.houseGuide?.emergencyNotes?.trim() && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm ${
                    darkMode ? 'bg-amber-950/20 border-amber-800/50' : 'bg-amber-50/70 border-amber-200'
                  }`}
                >
                  <div className="font-bold mb-1">🔑 Home Emergency &amp; Security Notes</div>
                  <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                    {beaconInfo.houseGuide.emergencyNotes}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

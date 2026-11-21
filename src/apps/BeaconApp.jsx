import React, { useState, useEffect } from 'react';
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
  const [draft, setDraft] = useState(beaconInfo || {});
  const [copiedWifi, setCopiedWifi] = useState(false);

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

  const handleCopyWifiPassword = async () => {
    const pwd = beaconInfo?.houseGuide?.wifiPassword;
    if (!pwd) return;
    const ok = await copyTextToClipboard(pwd);
    if (ok) {
      setCopiedWifi(true);
      if (showToast) showToast('Copied Wi-Fi password to clipboard');
      setTimeout(() => setCopiedWifi(false), 2000);
    } else if (showToast) {
      showToast('Could not copy Wi-Fi password automatically', 'error');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const cleanedContacts = Array.isArray(draft.contacts)
      ? draft.contacts.filter(
          (c) =>
            (c?.name || '').trim() ||
            (c?.phone || '').trim() ||
            (c?.note || '').trim()
        )
      : [];
    const ok = await onSaveBeacon({ ...draft, contacts: cleanedContacts });
    if (ok !== false) {
      setIsEditing(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* HEADER */}
      <section
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
              Beacon • Emergency, Vet &amp; House Guide
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Everything a pet sitter, guest, or household member needs for the pets and the house
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateApp('cadence')}
            className="px-2.5 sm:px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            title={`Open ${catName}'s Medicine (Cadence)`}
          >
            <Cat className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Cadence</span>
            <span className="hidden sm:inline">{catName} (Cadence)</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateApp('bloom')}
            className="px-2.5 sm:px-3 py-2 rounded-xl bg-lime-600 hover:bg-lime-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            title={`Open ${mantisName}'s Habitat & Care (Bloom)`}
          >
            <Flower2 className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Bloom</span>
            <span className="hidden sm:inline">{mantisName} (Bloom)</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setDraft(beaconInfo || {});
                setIsEditing(!isEditing);
              }}
              className={`p-2.5 sm:px-3.5 sm:py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title={isEditing ? 'Cancel Edit' : 'Edit Guide'}
              aria-label={isEditing ? 'Cancel Edit' : 'Edit Guide'}
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">{isEditing ? 'Cancel Edit' : 'Edit Guide'}</span>
            </button>
          )}
        </div>
      </section>

      {isEditing && canEdit ? (
        <form
          onSubmit={handleSave}
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <h3 className="text-base font-extrabold">Edit Beacon Guide</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
              className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
              className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
              className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
              className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
              className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-bold uppercase tracking-wider opacity-70">
                Household Emergency Contacts
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    contacts: [
                      ...(draft.contacts || []),
                      { id: `c-${Date.now()}`, name: '', phone: '', note: '' }
                    ]
                  })
                }
                className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Contact</span>
              </button>
            </div>
            {(draft.contacts || []).map((contact, idx) => (
              <div key={contact.id || idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={contact.name || ''}
                  onChange={(e) => {
                    const next = [...(draft.contacts || [])];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setDraft({ ...draft, contacts: next });
                  }}
                  placeholder="Name"
                  className="sm:col-span-3 px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
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
                  className="sm:col-span-4 px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
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
                  className="sm:col-span-4 px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      contacts: (draft.contacts || []).filter((_, i) => i !== idx)
                    })
                  }
                  className="sm:col-span-1 p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer"
                  title="Remove contact"
                  aria-label="Remove contact"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save Beacon Guide</span>
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
              <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Cat className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold">Pet Care</h2>
                <p className="text-xs text-slate-500">
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
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-lime-50/60 border-lime-200/70'
                }`}
              >
                <div className="font-bold text-lime-700 dark:text-lime-300 mb-1">
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
                <p className="leading-relaxed opacity-90">
                  {beaconInfo?.petCare?.feedingGuide || 'No feeding guide entered yet.'}
                </p>
              </div>

              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🧰 Carrier &amp; Medicine Supplies</div>
                <p className="leading-relaxed opacity-90">
                  {beaconInfo?.petCare?.carrierAndSupplies || 'No supply locations entered yet.'}
                </p>
              </div>

              <div
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🐾 Pet Quirks &amp; Notes</div>
                <p className="leading-relaxed opacity-90">
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
              <div className="p-2.5 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold">
                  Veterinary Clinic &amp; Emergency Contacts
                </h2>
                <p className="text-xs text-slate-500">Tap any phone number to call directly</p>
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
                    <a
                      href={`tel:${beaconInfo.vetInfo.phone.trim()}`}
                      className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Daytime: {beaconInfo.vetInfo.phone.trim()}</span>
                    </a>
                  )}
                  {beaconInfo?.vetInfo?.emergencyPhone?.trim() && (
                    <a
                      href={`tel:${beaconInfo.vetInfo.emergencyPhone.trim()}`}
                      className="px-3 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Emergency: {beaconInfo.vetInfo.emergencyPhone.trim()}</span>
                    </a>
                  )}
                </div>
              )}
              {beaconInfo?.vetInfo?.notes?.trim() && (
                <p className="text-xs pt-2 border-t border-rose-500/20 opacity-85">
                  {beaconInfo.vetInfo.notes}
                </p>
              )}
            </div>

            {/* Household Contact Cards */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider opacity-60">
                Household Contacts
              </div>
              {(beaconInfo?.contacts || []).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(beaconInfo?.contacts || []).map((c) => (
                    <div
                      key={c.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                        darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">
                          {c.name?.trim() || 'Household Contact'}
                        </div>
                        {c.note?.trim() && (
                          <div className="text-[11px] text-slate-500">{c.note}</div>
                        )}
                      </div>
                      {c.phone?.trim() ? (
                        <a
                          href={`tel:${c.phone.trim()}`}
                          className="px-3 py-1.5 rounded-xl bg-teal-600 text-white text-xs font-bold shrink-0"
                        >
                          {c.phone.trim()}
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic shrink-0">
                          No number
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No household emergency contacts entered yet.</p>
              )}
            </div>

            {/* Structured Home Wi-Fi & Utilities Sub-Cards */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>Home Wi-Fi &amp; Utilities</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                <div
                  className={`p-3.5 rounded-2xl border space-y-1 ${
                    darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Wi-Fi Network (SSID)
                  </div>
                  <div className="font-extrabold text-sm break-all">
                    {beaconInfo?.houseGuide?.wifiName || 'Not set'}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                    darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Wi-Fi Password
                    </div>
                    <div className="font-mono font-bold text-xs sm:text-sm break-all text-sky-600 dark:text-sky-300">
                      {beaconInfo?.houseGuide?.wifiPassword || 'Not set'}
                    </div>
                  </div>
                  {beaconInfo?.houseGuide?.wifiPassword && (
                    <button
                      type="button"
                      onClick={handleCopyWifiPassword}
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 shrink-0 transition cursor-pointer ${
                        copiedWifi
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : darkMode
                            ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Copy Wi-Fi Password"
                    >
                      {copiedWifi ? (
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
                <p className="leading-relaxed opacity-90">
                  {beaconInfo?.houseGuide?.binDayInfo || 'No bin collection details entered yet.'}
                </p>
              </div>

              <div
                className={`p-3.5 rounded-2xl border text-xs sm:text-sm ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-bold mb-1">🔧 Utilities, Stopcock &amp; Fuse Box</div>
                <p className="leading-relaxed opacity-90">
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
                  <p className="leading-relaxed opacity-90">
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

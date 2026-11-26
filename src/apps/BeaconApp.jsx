import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Cat,
  Edit3,
  Flower2,
  KeyRound,
  MapPin,
  Package,
  PawPrint,
  Phone,
  Pill,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Utensils,
  Wifi,
  Wrench
} from 'lucide-react';
import { copyTextToClipboard } from '../utils/householdHelpers.js';
import { useActionLock } from '../hooks/useActionLock.js';
import {
  Button,
  CardHeader,
  EmptyStateCard,
  ModuleHeader,
  ModulePage,
  SectionCard,
  StatusPill,
  SubSurface
} from '../components/HowardUI.jsx';
import CopyButton from './beacon/CopyButton.jsx';
import BeaconEditForm from './beacon/BeaconEditForm.jsx';

function BeaconApp({
  activeProfile,
  darkMode: _darkMode,
  beaconInfo,
  cadenceSettings,
  bloomSnapshot,
  onSaveBeacon,
  onNavigateApp,
  showToast
}) {
  const canEdit = activeProfile?.id !== 'caregiver';
  const [isEditing, setIsEditing] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const copyTimeoutRef = useRef(null);
  const { isPending: isSaving, runLocked } = useActionLock();

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canEdit && isEditing) {
      setIsEditing(false);
    }
  }, [canEdit, isEditing]);

  const catName = cadenceSettings?.catName || 'Pet';
  const bloomSettings = bloomSnapshot?.settings || {};
  const mantisName = bloomSettings.mantisName || 'Mantis';
  const contacts = beaconInfo?.contacts || [];

  const handleCopyValue = useCallback(
    async (key, value, label) => {
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
    },
    [showToast]
  );

  const handleSave = useCallback(
    async (cleanedBeacon) => {
      if (!canEdit) return;
      await runLocked(async () => {
        const ok = await onSaveBeacon(cleanedBeacon);
        if (ok !== false) {
          setIsEditing(false);
        }
      });
    },
    [canEdit, onSaveBeacon, runLocked]
  );

  return (
    <ModulePage module="beacon">
      {/* HEADER */}
      <ModuleHeader
        accent="sky"
        icon={ShieldAlert}
        shortTitle="Beacon • House Guide"
        title="Beacon • Emergency, Vet & House Guide"
        subtitle="Everything a pet sitter, guest, or household member needs for the pets and the house"
        actions={
          <>
            <Button
              variant="primary"
              accent="purple"
              size="md"
              icon={Cat}
              onClick={() => onNavigateApp('cadence')}
              title={`Open ${catName}'s Medicine (Cadence)`}
            >
              <span className="sm:hidden">Cadence</span>
              <span className="hidden sm:inline">{catName} (Cadence)</span>
            </Button>
            <Button
              variant="primary"
              accent="emerald"
              size="md"
              icon={Flower2}
              onClick={() => onNavigateApp('bloom')}
              title={`Open ${mantisName}'s Habitat & Care (Bloom)`}
            >
              <span className="sm:hidden">Bloom</span>
              <span className="hidden sm:inline">{mantisName} (Bloom)</span>
            </Button>
            {canEdit && (
              <Button
                variant={isEditing ? 'primary' : 'secondary'}
                accent="sky"
                size="md"
                icon={Edit3}
                disabled={isSaving}
                onClick={() => setIsEditing((prev) => !prev)}
                aria-pressed={isEditing}
                title={isEditing ? 'Cancel Edit' : 'Edit Guide'}
                aria-label={isEditing ? 'Cancel Edit' : 'Edit Guide'}
              >
                <span className="hidden sm:inline">{isEditing ? 'Cancel Edit' : 'Edit Guide'}</span>
              </Button>
            )}
          </>
        }
      />

      {isEditing && canEdit ? (
        <BeaconEditForm
          initialDraft={beaconInfo}
          isSaving={isSaving}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* 1. PET CARE & MEDICATION INSTRUCTIONS */}
          <SectionCard className="space-y-3.5">
            <CardHeader
              icon={Cat}
              accent="purple"
              title="Pet Care"
              subtitle={
                <>
                  Feeding, supplies &amp; {catName}&apos;s prescribed{' '}
                  {cadenceSettings?.medicationName || 'Oral Solution'} (
                  {cadenceSettings?.dosageLabel || '2.5 mg / 0.5 ml'})
                </>
              }
            />

            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border bg-purple-500/5 border-purple-500/20">
                <div className="font-bold text-purple-700 dark:text-purple-300 mb-1 flex items-center gap-1.5">
                  <Pill className="w-4 h-4 shrink-0" />
                  <span>
                    {catName}&apos;s Medication Schedule (~
                    {cadenceSettings?.morningTargetTime || '08:00'} &amp; ~
                    {cadenceSettings?.eveningTargetTime || '20:00'})
                  </span>
                </div>
                <p className="leading-relaxed">
                  {cadenceSettings?.administrationNote || beaconInfo?.petCare?.summary}
                </p>
              </div>

              <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border bg-emerald-500/5 border-emerald-500/20">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                  <Flower2 className="w-4 h-4 shrink-0" />
                  <span>
                    {mantisName} ({bloomSettings.commonName || 'Spiny Flower Mantis'} •{' '}
                    {bloomSettings.currentInstar || 'L2'})
                  </span>
                </div>
                <p className="leading-relaxed">
                  {bloomSettings.careNote ||
                    'Mist one enclosure wall lightly once daily for drinking droplets; never feed live prey during Premolt Watch or Post-Molt Hardening.'}
                </p>
              </div>

              <SubSurface className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Feeding Routine</span>
                </div>
                <p className="leading-relaxed text-text-secondary">
                  {beaconInfo?.petCare?.feedingGuide || 'No feeding guide entered yet.'}
                </p>
              </SubSurface>

              <SubSurface className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Carrier &amp; Medicine Supplies</span>
                </div>
                <p className="leading-relaxed text-text-secondary">
                  {beaconInfo?.petCare?.carrierAndSupplies || 'No supply locations entered yet.'}
                </p>
              </SubSurface>

              <SubSurface className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <PawPrint className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Pet Quirks &amp; Notes</span>
                </div>
                <p className="leading-relaxed text-text-secondary">
                  {beaconInfo?.petCare?.quirksAndNotes || 'No extra pet notes entered yet.'}
                </p>
              </SubSurface>
            </div>
          </SectionCard>

          {/* 2. EMERGENCY VET, HOUSEHOLD CONTACTS & UTILITIES */}
          <SectionCard className="space-y-3.5">
            <CardHeader
              icon={Stethoscope}
              accent="rose"
              title="Veterinary Clinic & Emergency Contacts"
              subtitle="Tap any phone number to call or copy directly"
            />

            <div className="p-3.5 rounded-xl sm:rounded-2xl border space-y-2 text-xs sm:text-sm bg-rose-500/5 border-rose-500/20">
              <div className="font-extrabold text-base">
                {beaconInfo?.vetInfo?.clinicName?.trim() || 'Veterinary Clinic not set'}
              </div>
              {beaconInfo?.vetInfo?.address?.trim() && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{beaconInfo.vetInfo.address.trim()}</span>
                </div>
              )}
              {beaconInfo?.vetInfo?.policyNumber?.trim() && (
                <div className="text-xs font-semibold text-text-secondary">
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
                        className="min-h-[40px] min-w-0 max-w-full break-all px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs inline-flex items-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="min-w-0 break-all">
                          Daytime: {beaconInfo.vetInfo.phone.trim()}
                        </span>
                      </a>
                      <CopyButton
                        isCopied={copiedKey === 'vet-daytime'}
                        onCopy={() =>
                          handleCopyValue('vet-daytime', beaconInfo.vetInfo.phone, 'daytime vet number')
                        }
                        title="Copy Daytime Vet Number"
                      />
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
                      <CopyButton
                        isCopied={copiedKey === 'vet-emergency'}
                        onCopy={() =>
                          handleCopyValue(
                            'vet-emergency',
                            beaconInfo.vetInfo.emergencyPhone,
                            'emergency vet number'
                          )
                        }
                        title="Copy Emergency Vet Number"
                      />
                    </div>
                  )}
                </div>
              )}
              {beaconInfo?.vetInfo?.notes?.trim() && (
                <p className="text-xs pt-2 border-t border-rose-500/20 text-text-secondary">
                  {beaconInfo.vetInfo.notes}
                </p>
              )}
            </div>

            {/* Household Contact Cards */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Household Contacts
              </div>
              {contacts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-2.5">
                  {contacts.map((c, idx) => {
                    const contactCopyId = `contact-${c.id || idx}`;
                    const contactLabel = c.name?.trim() || 'contact';
                    return (
                      <SubSurface
                        key={c.id || idx}
                        className="p-3.5 flex flex-wrap items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1 basis-[150px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm truncate">
                              {c.name?.trim() || 'Household Contact'}
                            </span>
                            {c.role?.trim() && (
                              <StatusPill accent="sky" className="shrink-0">
                                {c.role.trim()}
                              </StatusPill>
                            )}
                          </div>
                          {c.note?.trim() && (
                            <div className="text-xs text-text-muted mt-0.5">{c.note}</div>
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
                            <CopyButton
                              isCopied={copiedKey === contactCopyId}
                              onCopy={() =>
                                handleCopyValue(
                                  contactCopyId,
                                  c.phone,
                                  `${contactLabel}'s number`
                                )
                              }
                              title={`Copy ${contactLabel}'s phone number`}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted italic shrink-0">
                            No number
                          </span>
                        )}
                      </SubSurface>
                    );
                  })}
                </div>
              ) : (
                <EmptyStateCard
                  compact
                  accent="sky"
                  icon={Phone}
                  title="No household contacts yet"
                  description="Add emergency contacts in Edit Guide."
                />
              )}
            </div>

            {/* Structured Home Wi-Fi & Utilities Sub-Cards */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>Home Wi-Fi &amp; Utilities</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                <SubSurface className="p-3.5 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Wi-Fi Network (SSID)
                  </div>
                  <div className="font-extrabold text-sm break-all">
                    {beaconInfo?.houseGuide?.wifiName || 'Not set'}
                  </div>
                </SubSurface>

                <SubSurface className="p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      Wi-Fi Password
                    </div>
                    <div className="font-mono font-bold text-xs sm:text-sm break-all text-sky-700 dark:text-sky-300">
                      {beaconInfo?.houseGuide?.wifiPassword || 'Not set'}
                    </div>
                  </div>
                  {beaconInfo?.houseGuide?.wifiPassword && (
                    <CopyButton
                      isCopied={copiedKey === 'wifi'}
                      onCopy={() =>
                        handleCopyValue('wifi', beaconInfo.houseGuide.wifiPassword, 'Wi-Fi password')
                      }
                      title="Copy Wi-Fi Password"
                      showLabel
                    />
                  )}
                </SubSurface>
              </div>

              <SubSurface className="p-3.5 text-xs sm:text-sm">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Bin Collection</span>
                </div>
                <p className="leading-relaxed text-text-secondary">
                  {beaconInfo?.houseGuide?.binDayInfo || 'No bin collection details entered yet.'}
                </p>
              </SubSurface>

              <SubSurface className="p-3.5 text-xs sm:text-sm">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Utilities, Stopcock &amp; Fuse Box</span>
                </div>
                <p className="leading-relaxed text-text-secondary">
                  {beaconInfo?.houseGuide?.utilitiesInfo || 'No utilities info entered yet.'}
                </p>
              </SubSurface>

              {beaconInfo?.houseGuide?.emergencyNotes?.trim() && (
                <div className="p-3.5 rounded-2xl border text-xs sm:text-sm bg-amber-500/10 border-amber-500/35">
                  <div className="font-bold mb-1 flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    <span>Home Emergency &amp; Security Notes</span>
                  </div>
                  <p className="leading-relaxed text-text-secondary">
                    {beaconInfo.houseGuide.emergencyNotes}
                  </p>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </ModulePage>
  );
}

export default memo(BeaconApp);

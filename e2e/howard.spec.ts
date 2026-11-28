import { expect, test, type Locator, type Page } from '@playwright/test';

async function selectProfileOnModal(page: Page, profileName: 'Partner 1' | 'Partner 2' | 'Caregiver') {
  const modal = page.getByRole('dialog', { name: 'Switch Household Profile' });
  await expect(modal).toBeVisible();
  await modal.locator('button', { hasText: profileName }).first().click();
  await expect(modal).toBeHidden();
}

async function switchProfile(page: Page, profileName: 'Partner 1' | 'Partner 2' | 'Caregiver') {
  await page.locator('button[title="Switch Household Profile or Configure PIN"]').click();
  await selectProfileOnModal(page, profileName);
}

async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

function getSidebarButton(page: Page, moduleName: string): Locator {
  return page
    .locator('aside[aria-label="Howard Module Navigation"] button')
    .filter({ hasText: moduleName })
    .first();
}

test.describe('Howard E2E Verification Suite', () => {
  test('1. Partner 2 can visit all 8 modules with zero console or page errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await selectProfileOnModal(page, 'Partner 2');

    const modules: Array<{ id: string; navLabel: string; headingMatch: RegExp }> = [
      { id: 'foyer', navLabel: 'Foyer', headingMatch: /Good (morning|afternoon|evening)/i },
      { id: 'cadence', navLabel: 'Cadence', headingMatch: /Cadence/i },
      { id: 'bloom', navLabel: 'Bloom', headingMatch: /Bloom/i },
      { id: 'almanac', navLabel: 'Almanac', headingMatch: /Almanac/i },
      { id: 'floodgate', navLabel: 'Floodgate', headingMatch: /Floodgate/i },
      { id: 'ledger', navLabel: 'Ledger', headingMatch: /Ledger/i },
      { id: 'quill', navLabel: 'Quill', headingMatch: /Quill/i },
      { id: 'beacon', navLabel: 'Beacon', headingMatch: /Beacon/i }
    ];

    for (const mod of modules) {
      await getSidebarButton(page, mod.navLabel).click();
      const mainEl = page.locator(`main[data-module="${mod.id}"]`);
      await expect(mainEl).toBeVisible();
      await expect(mainEl).toContainText(mod.headingMatch);
    }

    expect(consoleErrors, `Unexpected console.error messages: ${consoleErrors.join('; ')}`).toEqual([]);
    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  });

  test('2. Desktop (1280x800) and Mobile (390x844) navigation & overflow checks', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await selectProfileOnModal(page, 'Partner 1');

    const sidebar = page.locator('aside[aria-label="Howard Module Navigation"]');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('main[data-module="foyer"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await getSidebarButton(page, 'Ledger').click();
    await expect(page.locator('main[data-module="ledger"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await getSidebarButton(page, 'Quill').click();
    await expect(page.locator('main[data-module="quill"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Switch to Mobile viewport (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(sidebar).toBeHidden();

    const mobilePill = page.locator('nav[aria-label="Mobile Floating App Launcher"]');
    await expect(mobilePill).toBeVisible();

    // Return to Foyer on mobile and verify overflow
    await mobilePill.getByRole('button', { name: 'Foyer' }).click();
    await expect(page.locator('main[data-module="foyer"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Open Bento Switcher on mobile -> Ledger
    await mobilePill.getByRole('button', { name: /Apps/i }).click();
    const bentoDialog = page.getByRole('dialog', { name: 'Howard Modules' });
    await expect(bentoDialog).toBeVisible();
    await bentoDialog.locator('button', { hasText: 'Ledger' }).click();
    await expect(page.locator('main[data-module="ledger"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Open Bento Switcher on mobile -> Quill
    await mobilePill.locator('button').nth(1).click();
    await expect(bentoDialog).toBeVisible();
    await bentoDialog.locator('button', { hasText: 'Quill' }).click();
    await expect(page.locator('main[data-module="quill"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('3. Enforces Partner 2 privacy isolation and Caregiver RBAC', async ({ page }) => {
    const privateGpTitle = `Private GP Appointment ${Date.now()}`;

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await selectProfileOnModal(page, 'Partner 2');

    // Partner 2 saves a Floodgate log entry
    await getSidebarButton(page, 'Floodgate').click();
    const floodgateMain = page.locator('main[data-module="floodgate"]');
    await expect(floodgateMain).toBeVisible();
    await floodgateMain
      .locator('textarea[placeholder*="Extra notes for today"]')
      .fill('Partner 2 confidential health note');
    const saveFloodgateBtn = floodgateMain.getByRole('button', { name: /Save Log for /i }).first();
    const floodgatePutPromise = page.waitForResponse(
      (res) => res.url().includes('/api/floodgate/') && res.request().method() === 'PUT'
    );
    await saveFloodgateBtn.click();
    const floodgatePutRes = await floodgatePutPromise;
    expect(floodgatePutRes.status()).toBe(200);

    // Partner 2 saves a medical Almanac event assigned to Partner 2
    await getSidebarButton(page, 'Almanac').click();
    const almanacMain = page.locator('main[data-module="almanac"]');
    await expect(almanacMain).toBeVisible();
    await almanacMain.getByRole('button', { name: 'Add Event' }).first().click();

    const eventDialog = page.getByRole('dialog', { name: 'Add Almanac Event' });
    await expect(eventDialog).toBeVisible();
    await eventDialog
      .locator('input[placeholder*="Vet Booster"]')
      .fill(privateGpTitle);
    await eventDialog.locator('#almanac-event-form select').selectOption({ label: 'Partner 2' });
    await eventDialog.getByRole('button', { name: 'GP / Health' }).click();

    const almanacBatchPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/howard/almanac/events/batch') && res.request().method() === 'POST'
    );
    await eventDialog.getByRole('button', { name: 'Save Event' }).click();
    const almanacBatchRes = await almanacBatchPromise;
    expect(almanacBatchRes.status()).toBe(200);
    await expect(eventDialog).toBeHidden();
    await expect(almanacMain).toContainText(privateGpTitle);

    // Switch to Partner 1: Floodgate hidden and medical event filtered
    await switchProfile(page, 'Partner 1');
    await expect(getSidebarButton(page, 'Floodgate')).toHaveCount(0);
    await getSidebarButton(page, 'Almanac').click();
    await expect(page.locator('main[data-module="almanac"]')).toBeVisible();
    await expect(page.locator('main[data-module="almanac"]')).not.toContainText(privateGpTitle);

    const p1SyncRes = await page.request.get('/api/howard/sync?profile=partner1');
    expect(p1SyncRes.status()).toBe(200);
    const p1SyncJson = (await p1SyncRes.json()) as {
      floodgate: unknown;
      howard?: { almanacEvents?: Array<{ title?: string }> };
    };
    expect(p1SyncJson.floodgate).toBeNull();
    expect(
      (p1SyncJson.howard?.almanacEvents || []).some((e) => e.title === privateGpTitle)
    ).toBe(false);

    // Switch to Caregiver: Floodgate hidden, medical event filtered, Quill mutation rejected with 403
    await switchProfile(page, 'Caregiver');
    await expect(getSidebarButton(page, 'Floodgate')).toHaveCount(0);

    const cgSyncRes = await page.request.get('/api/howard/sync?profile=caregiver');
    expect(cgSyncRes.status()).toBe(200);
    const cgSyncJson = (await cgSyncRes.json()) as {
      floodgate: unknown;
      howard?: { almanacEvents?: Array<{ title?: string }> };
    };
    expect(cgSyncJson.floodgate).toBeNull();
    expect(
      (cgSyncJson.howard?.almanacEvents || []).some((e) => e.title === privateGpTitle)
    ).toBe(false);

    const cgQuillPut = await page.request.put('/api/quill/notes/test-e2e-caregiver?profile=caregiver', {
      data: {
        title: 'Caregiver Forbidden Write',
        visibility: 'shared',
        type: 'text',
        body: 'Should be blocked'
      }
    });
    expect(cgQuillPut.status()).toBe(403);

    // Additional hardened Caregiver RBAC boundaries (SEC-04)
    expect(
      (
        await page.request.put('/api/cadence/settings?profile=caregiver', {
          data: { medicationName: 'Unauthorized' }
        })
      ).status()
    ).toBe(403);

    expect(
      (
        await page.request.put('/api/howard/beacon?profile=caregiver', {
          data: { contacts: [] }
        })
      ).status()
    ).toBe(403);

    expect(
      (
        await page.request.put('/api/bloom/settings?profile=caregiver', {
          data: { mantisName: 'Hijacked' }
        })
      ).status()
    ).toBe(403);

    // Private Quill note must NOT offer 'Remind in Almanac' (SEC-06)
    await switchProfile(page, 'Partner 2');
    await getSidebarButton(page, 'Quill').click();
    const quillMain = page.locator('main[data-module="quill"]');
    await expect(quillMain).toBeVisible();
    const privateNoteTitle = `Private Quill Note ${Date.now()}`;
    await quillMain.getByRole('button', { name: 'New Note' }).click();
    await quillMain.getByRole('button', { name: 'Shared Board' }).click();
    await expect(quillMain.getByRole('button', { name: 'Private' })).toBeVisible();
    await quillMain.locator('input[placeholder="Note title..."]').fill(privateNoteTitle);
    const privPutPromise = page.waitForResponse(
      (res) => res.url().includes('/api/quill/notes/') && res.request().method() === 'PUT'
    );
    await quillMain.getByRole('button', { name: 'Save Note' }).click();
    expect((await privPutPromise).status()).toBe(200);
    await quillMain.getByRole('tab', { name: /My Notes/i }).click();
    await quillMain.getByText(privateNoteTitle).first().click();
    const noteDialog = page.getByRole('dialog');
    await expect(noteDialog).toBeVisible();
    await expect(noteDialog.getByRole('button', { name: 'Remind in Almanac' })).toHaveCount(0);
    await noteDialog.getByRole('button', { name: 'Done' }).click();
  });

  test('4. Live SSE sync delivers new Quill note across browser contexts without reload', async ({
    browser
  }) => {
    const noteTitle = `SSE Sync Test Note ${Date.now()}`;
    const noteBody = 'Cross-device live SSE payload verification';

    const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await pageA.goto('/');
      await selectProfileOnModal(pageA, 'Partner 1');
      await getSidebarButton(pageA, 'Quill').click();
      await expect(pageA.locator('main[data-module="quill"]')).toBeVisible();
      await expect(pageA.locator('header')).toContainText('Live');

      await pageB.goto('/');
      await selectProfileOnModal(pageB, 'Partner 1');
      await getSidebarButton(pageB, 'Quill').click();
      await expect(pageB.locator('main[data-module="quill"]')).toBeVisible();
      await expect(pageB.locator('header')).toContainText('Live');

      const quillA = pageA.locator('main[data-module="quill"]');
      await quillA.getByRole('button', { name: 'New Note' }).click();
      await quillA.locator('input[placeholder="Note title..."]').fill(noteTitle);
      await quillA.locator('textarea[placeholder*="Write your note"]').fill(noteBody);

      const quillPutPromise = pageA.waitForResponse(
        (res) => res.url().includes('/api/quill/notes/') && res.request().method() === 'PUT'
      );
      await quillA.getByRole('button', { name: 'Save Note' }).click();
      const quillPutRes = await quillPutPromise;
      expect(quillPutRes.status()).toBe(200);

      await expect(quillA).toContainText(noteTitle);

      // Context B receives the new note automatically via SSE without reloading
      const quillB = pageB.locator('main[data-module="quill"]');
      await expect(quillB).toContainText(noteTitle, { timeout: 10_000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

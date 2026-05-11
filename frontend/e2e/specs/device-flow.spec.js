import { test, expect } from '../fixtures/auth.js';

test.describe('Device lifecycle critical path', () => {
  test('login bypass lands on the dashboard with an empty device list', async ({ authedPage: page }) => {
    await page.goto('/');
    // The Dashboard's h1 is the literal "Inventory." word — a kept-stable brand element.
    await expect(page.getByRole('heading', { name: 'Inventory.' })).toBeVisible({ timeout: 15_000 });
    // No devices seeded → the add-device button is the only meaningful action.
    await expect(page.getByRole('button', { name: /add device/i })).toBeVisible();
  });

  test('create device → it appears in the table', async ({ authedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add device/i }).click();

    const mac =
      'AA:BB:CC:' +
      Array.from({ length: 3 }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase(),
      ).join(':');

    // The label and input aren't htmlFor-linked, so getByLabel doesn't bind.
    // Target by placeholder (the MAC-format example "AA:BB:CC:DD:EE:FF").
    const macInput = page.getByPlaceholder('AA:BB:CC:DD:EE:FF');
    await macInput.fill(mac);

    // Select first available product type
    const productSelect = page.locator('select').first();
    await productSelect.selectOption('AEMS');

    // The modal opened above contains its own "Add Device" submit button.
    // There are now two "Add Device" buttons on the page (the trigger and the
    // submit) — target the submit one by its position inside the dialog.
    const submit = page.getByRole('button', { name: /^add device$/i }).last();
    await submit.click();

    // Verify the new MAC shows somewhere on the dashboard within a few seconds.
    await expect(page.getByText(mac).first()).toBeVisible({ timeout: 8_000 });
  });
});

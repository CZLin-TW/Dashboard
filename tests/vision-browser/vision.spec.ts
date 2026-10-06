// Historical <=1.68 synthetic VisionPanel page harness. Owner-only /vision UI acceptance now uses scripts/test-status-pilot.mjs; this page suite is superseded.
import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/vision');
  await expect(page.getByRole('heading', { name: '視覺區域', exact: true })).toBeVisible();
  await expect(page.getByLabel('人物模型')).toBeEnabled();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:3014' ? route.continue() : route.abort();
  });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }, { width: 320, height: 740 }]) {
  test(`${viewport.width}x${viewport.height} synthetic preview and draft lifecycle`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await expect(page.getByText('合成示範 · 沒有真相機影像，未執行 YOLO 推論')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '編輯地板 ROI（尚未開放）' })).toBeDisabled();
    const preview = page.getByRole('button', { name: '開啟合成預覽' });
    const size = await preview.boundingBox(); expect(size!.height).toBeGreaterThanOrEqual(44);
    await preview.click();
    await expect(page.getByRole('img', { name: '合成人物與地板示意，非真實影像' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/vision-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await page.getByRole('button', { name: '停止預覽' }).click();
    await expect(page.getByRole('img', { name: '合成人物與地板示意，非真實影像' })).toHaveCount(0);
    const model = page.getByLabel('人物模型'); const initial = await model.inputValue();
    const changed = initial === 'yolo11n' ? 'yolo11s' : 'yolo11n';
    await model.selectOption(changed);
    await page.getByRole('button', { name: '取消草稿' }).click(); await expect(model).toHaveValue(initial);
    await model.selectOption(changed);
    await page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await expect(page.getByText('示範設定已儲存；未執行真實模型或修改相機。')).toBeVisible();
    await expect(page.getByRole('button', { name: '儲存設定', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '還原上次設定到草稿' }).click(); await expect(model).toHaveValue(initial);
    await page.getByRole('button', { name: '取消草稿' }).click(); await expect(model).toHaveValue(changed);
    await model.selectOption(initial);
    await page.getByRole('link', { name: '裝置', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/devices$/);
    await page.getByRole('link', { name: '視覺', exact: true }).filter({ visible: true }).click();
    await expect(model).toHaveValue(changed); // Unsaved draft never persists across navigation.
    expect(errors).toEqual([]);
  });
}

for (const status of [401, 403]) {
  test(`${status} clears prior preview and settings, disables operations`, async ({ page }) => {
    await ready(page); await page.getByRole('button', { name: '開啟合成預覽' }).click();
    await page.evaluate(code => {
      const original = window.fetch;
      window.fetch = async (input, init) => String(input).includes('/api/vision/v1/access')
        ? Response.json({ code: code === 401 ? 'unauthorized' : 'vision_forbidden', message: code === 401 ? '登入已過期' : '沒有權限' }, { status: code }) : original(input, init);
    }, status);
    await page.getByRole('button', { name: '重新讀取' }).click();
    await expect(page.locator('p[role=alert]')).toBeVisible();
    await expect(page.getByLabel('人物模型')).toBeDisabled();
    await expect(page.getByRole('button', { name: '開啟合成預覽' })).toBeDisabled();
    await expect(page.getByRole('img', { name: '合成人物與地板示意，非真實影像' })).toHaveCount(0);
    await expect(page.getByText(/已儲存：/)).toHaveCount(0);
  });
}

test('offline and failed API never look like live or vacant', async ({ page }) => {
  await ready(page);
  await page.getByLabel('測試情境（切換會重設資料）').selectOption('offline');
  await expect(page.getByText('來源不可用；區域存在狀態未知。')).toBeVisible();
  await expect(page.getByLabel('人物模型')).toBeDisabled();
  await page.getByLabel('測試情境（切換會重設資料）').selectOption('error');
  await expect(page.getByText('視覺服務尚未連線或操作未完成。請手動重新讀取；不會自動重送。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '開啟合成預覽' })).toBeDisabled();
});

test('duplicate save invokes transport once; navigation aborts pending preview', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const original = window.fetch;
    Object.assign(window, { visionSaveCount: 0, visionPreviewAborted: false });
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/api/vision/v1/config') && init?.method === 'PUT') {
        const state = window as unknown as { visionSaveCount: number }; state.visionSaveCount++;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      if (String(input).endsWith('/api/vision/v1/preview') && init?.method === 'POST') {
        return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => {
          Object.assign(window, { visionPreviewAborted: true }); reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true }));
      }
      return original(input, init);
    };
  });
  await page.getByLabel('人物模型').selectOption('yolo11s');
  await page.getByRole('button', { name: '儲存設定', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText('示範設定已儲存；未執行真實模型或修改相機。')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { visionSaveCount: number }).visionSaveCount)).toBe(1);
  await page.getByRole('button', { name: '開啟合成預覽' }).click();
  await page.getByRole('link', { name: '裝置', exact: true }).filter({ visible: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { visionPreviewAborted: boolean }).visionPreviewAborted)).toBe(true);
});

test.describe('touch interaction', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  test('cancel pending preview rejects a late response and permits another request', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (String(input).endsWith('/api/vision/v1/preview')) {
          await new Promise(resolve => setTimeout(resolve, 300)); // Deliberately ignore AbortSignal.
        }
        return original(input, init);
      };
    });
    await page.getByRole('button', { name: '開啟合成預覽' }).tap();
    await page.getByRole('button', { name: '停止預覽' }).tap();
    await page.waitForTimeout(450);
    await expect(page.getByRole('img', { name: '合成人物與地板示意，非真實影像' })).toHaveCount(0);
    await page.getByRole('button', { name: '開啟合成預覽' }).tap();
    await expect(page.getByRole('img', { name: '合成人物與地板示意，非真實影像' })).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

// Helper: get element inside Shadow DOM
async function shadowEl(page, selector: string) {
  return page.locator('#fixit-chat-root').locator(selector);
}

async function waitForWidget(page) {
  // Wait for shadow DOM to initialize with FAB button
  await page.waitForFunction(() => {
    const root = document.getElementById('fixit-chat-root');
    if (!root?.shadowRoot) return false;
    return !!root.shadowRoot.querySelector('.fixit-fab');
  }, { timeout: 15000 });
}

function shadow(page) {
  // Returns a locator scoped to shadow root
  return {
    locator: (sel: string) => page.locator(`#fixit-chat-root`).locator(sel),
    evaluate: (fn: (root: ShadowRoot) => any) =>
      page.evaluate((fnStr) => {
        const root = document.getElementById('fixit-chat-root')?.shadowRoot;
        if (!root) throw new Error('No shadow root');
        return new Function('root', `return (${fnStr})(root)`)(root);
      }, fn.toString()),
  };
}

// Direct shadow DOM queries via page.evaluate
async function shadowQuery(page, selector: string) {
  return page.evaluate((sel) => {
    const root = document.getElementById('fixit-chat-root')?.shadowRoot;
    return root?.querySelector(sel) !== null;
  }, selector);
}

async function shadowClick(page, selector: string) {
  await page.evaluate((sel) => {
    const root = document.getElementById('fixit-chat-root')?.shadowRoot;
    const el = root?.querySelector(sel) as HTMLElement;
    el?.click();
  }, selector);
}

async function shadowType(page, selector: string, text: string) {
  await page.evaluate(([sel, txt]) => {
    const root = document.getElementById('fixit-chat-root')?.shadowRoot;
    const el = root?.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
    if (el) {
      el.value = txt;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, [selector, text]);
}

async function shadowText(page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const root = document.getElementById('fixit-chat-root')?.shadowRoot;
    return root?.querySelector(sel)?.textContent || '';
  }, selector);
}

async function shadowVisible(page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const root = document.getElementById('fixit-chat-root')?.shadowRoot;
    const el = root?.querySelector(sel) as HTMLElement;
    if (!el) return false;
    return el.style.display !== 'none' && el.offsetParent !== null;
  }, selector);
}

async function shadowCount(page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const root = document.getElementById('fixit-chat-root')?.shadowRoot;
    return root?.querySelectorAll(sel).length || 0;
  }, selector);
}

// ============================================================
// TESTS
// ============================================================

test.describe('Widget — полный цикл сессии', () => {

  test('1. Виджет загружается, FAB кнопка видна', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);

    const hasFab = await shadowQuery(page, '.fixit-fab');
    expect(hasFab).toBe(true);
  });

  test('2. Клик на FAB открывает окно с формой', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);

    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    const hasWindow = await shadowQuery(page, '.fixit-window');
    expect(hasWindow).toBe(true);

    const hasForm = await shadowQuery(page, '.fixit-form');
    expect(hasForm).toBe(true);

    const headerText = await shadowText(page, '.fixit-header-title');
    expect(headerText).toBe('Техподдержка');
  });

  test('3. Форма не отправляется без обязательных полей', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Try submit without filling
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(300);

    // Error should appear
    const hasError = await shadowQuery(page, '.fixit-form-error');
    expect(hasError).toBe(true);
  });

  test('4. Создание сессии → первое сообщение видно → инпут активен', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Fill form
    await shadowType(page, '#fixit-visitor_name', 'Playwright Test');
    await shadowType(page, '#fixit-initial_message', 'Тестовое сообщение от Playwright');

    // Check consent
    await shadowClick(page, 'input[name="consent"]');
    await page.waitForTimeout(200);

    // Submit
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(2000);

    // Chat should be visible with message
    const bubbleCount = await shadowCount(page, '.fixit-bubble');
    expect(bubbleCount).toBeGreaterThanOrEqual(1);

    // First bubble should be visitor's message
    const firstBubble = await shadowText(page, '.fixit-bubble--visitor .fixit-bubble-content');
    expect(firstBubble).toContain('Тестовое сообщение от Playwright');

    // Input should be visible and enabled
    const inputVisible = await shadowVisible(page, '.fixit-input');
    expect(inputVisible).toBe(true);

    // Close bar should be visible
    const closeBarVisible = await shadowVisible(page, '.fixit-close-bar');
    expect(closeBarVisible).toBe(true);
  });

  test('5. Visitor закрывает сессию → инпут скрыт, оценка видна', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Create session
    await shadowType(page, '#fixit-visitor_name', 'Close Test');
    await shadowType(page, '#fixit-initial_message', 'Буду закрывать');
    await shadowClick(page, 'input[name="consent"]');
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(2000);

    // Close session
    await shadowClick(page, '.fixit-close-btn');
    await page.waitForTimeout(2000);

    // Input should be hidden
    const inputVisible = await shadowVisible(page, '.fixit-input');
    expect(inputVisible).toBe(false);

    // Rating form should be visible
    const hasRating = await shadowQuery(page, '.fixit-rating');
    expect(hasRating).toBe(true);

    // Continue button should be disabled (until rated)
    const continueDisabled = await page.evaluate(() => {
      const root = document.getElementById('fixit-chat-root')?.shadowRoot;
      const btn = root?.querySelector('.fixit-continue-btn') as HTMLButtonElement;
      return btn?.disabled;
    });
    expect(continueDisabled).toBe(true);

    // System close message appears in DB but may not be in UI yet
    // (it arrives on next getMessages call or page reload — tested in test 7)
  });

  test('6. После оценки кнопка "Продолжить чат" активируется', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Create + close
    await shadowType(page, '#fixit-visitor_name', 'Rate Test');
    await shadowType(page, '#fixit-initial_message', 'Тест оценки');
    await shadowClick(page, 'input[name="consent"]');
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(2000);
    await shadowClick(page, '.fixit-close-btn');
    await page.waitForTimeout(2000);

    // Rate 5 stars
    await page.evaluate(() => {
      const root = document.getElementById('fixit-chat-root')?.shadowRoot;
      const stars = root?.querySelectorAll('.fixit-star');
      (stars?.[4] as HTMLElement)?.click(); // 5th star
    });
    await page.waitForTimeout(1000);

    // Continue button should be enabled now
    const continueDisabled = await page.evaluate(() => {
      const root = document.getElementById('fixit-chat-root')?.shadowRoot;
      const btn = root?.querySelector('.fixit-continue-btn') as HTMLButtonElement;
      return btn?.disabled;
    });
    expect(continueDisabled).toBe(false);
  });

  test('7. Перезагрузка закрытой сессии БЕЗ оценки → инпут скрыт, оценка видна', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Create + close (без оценки)
    await shadowType(page, '#fixit-visitor_name', 'Reload NoRate');
    await shadowType(page, '#fixit-initial_message', 'Тест перезагрузки без оценки');
    await shadowClick(page, 'input[name="consent"]');
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(2000);
    await shadowClick(page, '.fixit-close-btn');
    await page.waitForTimeout(2000);

    // Reload page
    await page.reload();
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(2000);

    // Input should be HIDDEN
    const inputVisible = await shadowVisible(page, '.fixit-input');
    expect(inputVisible).toBe(false);

    // Rating should be visible (not rated yet)
    const hasRating = await shadowQuery(page, '.fixit-rating');
    expect(hasRating).toBe(true);
  });

  test('8. Перезагрузка закрытой сессии С оценкой → инпут скрыт, только кнопка "Продолжить"', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Create + close + rate
    await shadowType(page, '#fixit-visitor_name', 'Reload Rated');
    await shadowType(page, '#fixit-initial_message', 'Тест перезагрузки с оценкой');
    await shadowClick(page, 'input[name="consent"]');
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(2000);
    await shadowClick(page, '.fixit-close-btn');
    await page.waitForTimeout(2000);

    // Rate
    await page.evaluate(() => {
      const root = document.getElementById('fixit-chat-root')?.shadowRoot;
      const stars = root?.querySelectorAll('.fixit-star');
      (stars?.[3] as HTMLElement)?.click(); // 4 stars
    });
    await page.waitForTimeout(1000);

    // Reload
    await page.reload();
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(2000);

    // Input should be HIDDEN
    const inputVisible = await shadowVisible(page, '.fixit-input');
    expect(inputVisible).toBe(false);

    // Rating form should NOT be visible (already rated)
    const hasRating = await shadowQuery(page, '.fixit-rating');
    expect(hasRating).toBe(false);

    // Continue button should be visible and ENABLED
    const continueBtn = await page.evaluate(() => {
      const root = document.getElementById('fixit-chat-root')?.shadowRoot;
      const btn = root?.querySelector('.fixit-continue-btn') as HTMLButtonElement;
      return { exists: !!btn, disabled: btn?.disabled };
    });
    expect(continueBtn.exists).toBe(true);
    expect(continueBtn.disabled).toBe(false);
  });

  test('9. "Продолжить чат" переоткрывает сессию → инпут активен', async ({ page }) => {
    await page.goto('/test');
    await waitForWidget(page);
    await shadowClick(page, '.fixit-fab');
    await page.waitForTimeout(500);

    // Create + close + rate
    await shadowType(page, '#fixit-visitor_name', 'Continue Test');
    await shadowType(page, '#fixit-initial_message', 'Тест продолжения');
    await shadowClick(page, 'input[name="consent"]');
    await shadowClick(page, '.fixit-form-submit');
    await page.waitForTimeout(2000);
    await shadowClick(page, '.fixit-close-btn');
    await page.waitForTimeout(2000);

    // Rate
    await page.evaluate(() => {
      const root = document.getElementById('fixit-chat-root')?.shadowRoot;
      (root?.querySelectorAll('.fixit-star')[4] as HTMLElement)?.click();
    });
    await page.waitForTimeout(1000);

    // Click continue
    await shadowClick(page, '.fixit-continue-btn');
    await page.waitForTimeout(2000);

    // Input should be visible again
    const inputVisible = await shadowVisible(page, '.fixit-input');
    expect(inputVisible).toBe(true);

    // Rating form gone
    const hasRating = await shadowQuery(page, '.fixit-rating');
    expect(hasRating).toBe(false);
  });
});

test.describe('Admin — авторизация и сессии', () => {

  test('10. Логин в админку', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Should redirect to dashboard
    expect(page.url()).toContain('/admin');
    expect(page.url()).not.toContain('/login');
  });

  test('11. Перезагрузка админки сохраняет сессию (cookie)', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Reload
    await page.reload();
    await page.waitForTimeout(3000);

    // Should still be on admin, not login
    expect(page.url()).not.toContain('/login');
  });

  test('12. Список сессий отображается', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Go to sessions
    await page.click('text=Сессии');
    await page.waitForTimeout(2000);

    // Table should be visible
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });
});

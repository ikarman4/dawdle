import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectInView(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.width).toBeGreaterThan(8);
  expect(box!.height).toBeGreaterThan(8);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + Math.min(box!.width, 40)).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

async function openToday(page: Page) {
  await page.goto("/dawdle/#play");
  const how = page.getByRole("dialog", { name: "How to play" });
  await expect(how).toBeVisible();
  await expect(how.getByText("Everyone hears the same 20 seconds")).toBeVisible();
  await expect(how.getByText("Tap the roll to place a note.")).toBeVisible();
  await page.getByRole("button", { name: "Let's play" }).click();
  await expect(how).toBeHidden();
}

async function expectStudio(page: Page) {
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "listen");
  await expectInView(page, page.getByRole("button", { name: "Play", exact: true }));
  await expectInView(page, page.getByRole("button", { name: "Select instrument" }));
  await expectInView(page, page.getByRole("button", { name: "Submit", exact: true }));
  await expectInView(page, page.getByLabel("Volume for the song and your instruments"));
  await expect(page.getByRole("heading", { name: "Your song" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
}

test("desktop studio path", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openToday(page);
  await expectStudio(page);
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("dialog", { name: "How to play" })).toBeVisible();
  await page.getByRole("button", { name: "Close instructions" }).click();
  await expect(page.getByText("Add an instrument to get started.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Select instrument" }).click();
  await expect(page.getByRole("listbox", { name: "Instruments" })).toBeVisible();
  await expect(page.getByTestId("instrument")).toHaveCount(0);
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  await expect(page.getByTestId("instrument")).toBeVisible();
  const roll = page.getByTestId("instrument");
  const box = await roll.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + 160, box!.y + 24);
  await expect(page.getByTestId("roll-note")).toHaveCount(1);
  await page.getByRole("button", { name: "Add instrument" }).click();
  await expect(page.getByRole("listbox", { name: "Instruments" })).toBeVisible();
  await expect(page.getByTestId("instrument")).toHaveCount(0);
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "listen");
});

test("roll places, hears, stretches, moves, and saves piano and drums", async ({ page }) => {
  await page.addInitScript(() => {
    const started = { count: 0 };
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: unknown[]) {
      started.count += 1;
      (window as unknown as { __heard: number }).__heard = started.count;
      return original.apply(this, args as []);
    };
    (window as unknown as { __heard: number }).__heard = 0;
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await openToday(page);

  await page.getByRole("button", { name: "Select instrument" }).click();
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  const roll = page.getByTestId("instrument");
  await expect(roll).toBeVisible();
  const wide = await roll.evaluate((el) => ({ scroll: el.scrollWidth, view: el.clientWidth, sheet: el.querySelector(".daw-sheet")?.clientWidth ?? 0 }));
  expect(wide.scroll).toBeGreaterThan(wide.view + 400);
  expect(wide.sheet).toBeGreaterThanOrEqual(1400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);

  const before = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  const scroller = await roll.boundingBox();
  expect(scroller).toBeTruthy();
  await page.mouse.click(scroller!.x + 130, scroller!.y + 10);
  const note = page.getByTestId("roll-note");
  await expect(note).toHaveCount(1);
  expect(Number(await note.getAttribute("data-time"))).toBeGreaterThan(0.2);
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard)).toBeGreaterThan(before);
  await note.evaluate((el) => el.scrollIntoView({ inline: "center", block: "nearest" }));

  const duration = Number(await note.getAttribute("data-duration"));
  const box = await note.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width - 3, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width + 80, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await note.getAttribute("data-duration"))).toBeGreaterThan(duration + 0.2);

  const pitch = Number(await note.getAttribute("data-pitch"));
  const body = await note.boundingBox();
  expect(body).toBeTruthy();
  await page.mouse.move(body!.x + 8, body!.y + body!.height / 2);
  await page.mouse.down();
  await page.mouse.move(body!.x + 8, body!.y + body!.height / 2 + 42, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId("roll-note").getAttribute("data-pitch"))).toBeLessThan(pitch);

  const heard = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.getByRole("button", { name: "Play this instrument" }).click();
  await expect(page.getByTestId("listen")).toHaveAttribute("data-part", "on");
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard), { timeout: 8_000 }).toBeGreaterThan(heard);
  await page.getByRole("button", { name: "Stop this instrument" }).click();

  await page.getByRole("button", { name: "Save to song" }).click();
  await expect(page.getByRole("button", { name: "Piano track" })).toBeVisible();

  await page.getByRole("button", { name: "Select instrument" }).click();
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  await roll.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const end = await roll.boundingBox();
  expect(end).toBeTruthy();
  await page.mouse.click(end!.x + end!.width - 48, end!.y + 10);
  await expect(page.getByTestId("roll-note")).toHaveCount(1);
  expect(Number(await page.getByTestId("roll-note").getAttribute("data-time"))).toBeGreaterThan(12);
  await page.getByRole("button", { name: "Save to song" }).click();
  await expect(page.getByRole("button", { name: "Piano 2 track" })).toBeVisible();

  await page.getByRole("button", { name: "Select instrument" }).click();
  await page.getByRole("button", { name: "Drum kit", exact: true }).click();
  const drums = page.getByTestId("instrument");
  const drumBox = await drums.boundingBox();
  expect(drumBox).toBeTruthy();
  const drumBefore = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.mouse.click(drumBox!.x + 100, drumBox!.y + 16);
  const hit = page.getByTestId("roll-note");
  await expect(hit).toHaveAttribute("data-drum", "kick");
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard)).toBeGreaterThan(drumBefore);

  const hitDuration = Number(await hit.getAttribute("data-duration"));
  const hitBox = await hit.boundingBox();
  expect(hitBox).toBeTruthy();
  await page.mouse.move(hitBox!.x + hitBox!.width - 2, hitBox!.y + hitBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hitBox!.x + hitBox!.width + 70, hitBox!.y + hitBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId("roll-note").getAttribute("data-duration"))).toBeGreaterThan(hitDuration);

  const hitBody = await page.getByTestId("roll-note").boundingBox();
  expect(hitBody).toBeTruthy();
  await page.mouse.move(hitBody!.x + 4, hitBody!.y + 8);
  await page.mouse.down();
  await page.mouse.move(hitBody!.x + 4, hitBody!.y + 8 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("roll-note")).toHaveAttribute("data-drum", "snare");

  const drumHeard = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.getByRole("button", { name: "Play this instrument" }).click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard), { timeout: 8_000 }).toBeGreaterThan(drumHeard);
  await page.getByRole("button", { name: "Stop this instrument" }).click();
  await page.getByRole("button", { name: "Save to song" }).click();
  await expect(page.getByRole("button", { name: "Drum kit track" })).toBeVisible();

  const mixBefore = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.getByRole("button", { name: "Listen" }).click();
  await expect(page.getByRole("button", { name: "Stop your song" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard), { timeout: 8_000 }).toBeGreaterThan(mixBefore);
});

test("mobile studio path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openToday(page);
  await expectStudio(page);
  await page.goto("/dawdle/#leaderboard");
  await expect(page.getByTestId("board")).toContainText("Finish all five tries");
});

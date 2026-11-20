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

async function stableBox(locator: Locator) {
  let last = await locator.boundingBox();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await locator.page().waitForTimeout(200);
    const next = await locator.boundingBox();
    if (last && next && Math.abs(last.y - next.y) < 1 && Math.abs(last.x - next.x) < 1) return next;
    last = next;
  }
  return last;
}

async function addAndPick(page: Page, name: string) {
  await page.getByRole("button", { name: "Add instrument" }).click();
  await page.getByRole("button", { name: "Select instrument" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function expectStudio(page: Page) {
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "listen");
  await expectInView(page, page.getByRole("button", { name: "Play", exact: true }));
  await expectInView(page, page.getByRole("button", { name: "Instrument playground" }));
  await expectInView(page, page.getByRole("button", { name: "Add instrument" }));
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
  await page.getByRole("button", { name: "Instrument playground" }).click();
  await expect(page.locator(".playground .inst-grid")).toBeVisible();
  await expect(page.locator(".song-card .inst-grid")).toHaveCount(0);
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  await expect(page.locator(".playground").getByTestId("instrument")).toBeVisible();
  const playground = page.locator(".playground").getByTestId("instrument");
  const playgroundBox = await playground.boundingBox();
  expect(playgroundBox).toBeTruthy();
  await page.mouse.click(playgroundBox!.x + 140, playgroundBox!.y + 36);
  await expect(page.getByTestId("roll-note")).toHaveCount(1);
  await page.getByRole("button", { name: "Save to song" }).click();
  await expect(page.getByRole("button", { name: "Piano track" })).toBeVisible();
  await expect(page.locator(".playground").getByTestId("instrument")).toHaveCount(0);
  await expect(page.getByLabel("Tries")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add instrument" }).click();
  await page.getByRole("button", { name: "Add instrument" }).click();
  const selects = page.getByRole("button", { name: "Select instrument" });
  await expect(selects).toHaveCount(2);
  await expect(page.getByRole("listbox", { name: "Instruments" })).toHaveCount(0);
  await selects.first().click();
  await expect(page.locator(".song-card .inst-grid")).toBeVisible();
  await expect(page.locator(".playground .inst-grid")).toHaveCount(0);
  await expect(page.getByTestId("instrument")).toHaveCount(0);
  const piano = page.getByRole("button", { name: "Piano", exact: true });
  await expect(piano).toContainText("🎹");
  await expect(page.locator(".inst-grid svg")).toHaveCount(0);
  await piano.click();
  await expect(page.getByTestId("instrument")).toBeVisible();
  const roll = page.getByTestId("instrument");
  const box = await roll.boundingBox();
  expect(box).toBeTruthy();
  const cursor = await roll.locator("button.daw-row").first().evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toBe("cell");
  await page.mouse.move(box!.x + 160, box!.y + 24);
  await page.mouse.down();
  await page.mouse.move(box!.x + 168, box!.y + 30, { steps: 3 });
  await page.mouse.up();
  const later = await roll.boundingBox();
  expect(later).toBeTruthy();
  await page.mouse.click(later!.x + later!.width - 18, later!.y + 96);
  const placed = page.getByTestId("roll-note");
  await expect(placed).toHaveCount(2);
  const times = await placed.evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-time"))));
  expect(Math.min(...times)).toBeGreaterThan(0.2);
  expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(1.5);
  await page.getByRole("button", { name: "Add instrument" }).click();
  await expect(page.getByRole("button", { name: "Select instrument" })).toHaveCount(2);
  await expect(page.getByRole("listbox", { name: "Instruments" })).toHaveCount(0);
  await expect(page.getByTestId("instrument")).toBeVisible();
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "listen");
  await page.getByRole("button", { name: "Hint" }).click();
  const line = page.locator(".hint-line");
  await expect(line).toContainText("In this song:");
  const names = (await line.innerText()).replace(/^.*?:\s*/, "").split(",").map((part) => part.trim()).filter(Boolean);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}( \\d+)? track$`) }).first()).toBeVisible();
  }
  const pianoRows = await page.getByRole("button", { name: /^Piano( \d+)? track$/ }).count();
  const songHasPiano = names.includes("Piano");
  await expect(page.locator(".track.flash-have")).toHaveCount(songHasPiano ? pianoRows : 0);
  await expect(page.locator(".track.flash-new")).toHaveCount(names.length - (songHasPiano ? 1 : 0));
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

  await addAndPick(page, "Piano");
  const roll = page.getByTestId("instrument");
  await expect(roll).toBeVisible();
  const wide = await roll.evaluate((el) => ({ scroll: el.scrollWidth, view: el.clientWidth, sheet: el.querySelector(".daw-sheet")?.clientWidth ?? 0 }));
  expect(wide.scroll).toBeGreaterThan(wide.view + 400);
  expect(wide.sheet).toBeGreaterThanOrEqual(1400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);

  const scroller = await stableBox(roll);
  expect(scroller).toBeTruthy();
  const glideBefore = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.mouse.move(scroller!.x + 130, scroller!.y + 8);
  await page.mouse.down();
  await page.mouse.move(scroller!.x + 130, scroller!.y + 108, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard)).toBeGreaterThan(glideBefore);
  const kept = page.getByTestId("roll-note");
  await expect(kept).toHaveCount(1);
  await kept.click();
  await kept.click();
  await expect(kept).toHaveCount(0);
  const keys = await roll.boundingBox();
  expect(keys).toBeTruthy();
  const keyBefore = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.mouse.move(keys!.x + 18, keys!.y + 8);
  await page.mouse.down();
  await page.mouse.move(keys!.x + 18, keys!.y + 90, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard)).toBeGreaterThan(keyBefore + 1);
  await expect(page.getByTestId("roll-note")).toHaveCount(0);

  const spot = await roll.boundingBox();
  expect(spot).toBeTruthy();
  const before = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.mouse.click(spot!.x + 130, spot!.y + 30);
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

  const time = Number(await page.getByTestId("roll-note").getAttribute("data-time"));
  const held = Number(await page.getByTestId("roll-note").getAttribute("data-duration"));
  const heldPitch = Number(await page.getByTestId("roll-note").getAttribute("data-pitch"));
  const shifted = await page.getByTestId("roll-note").boundingBox();
  expect(shifted).toBeTruthy();
  await page.mouse.move(shifted!.x + 12, shifted!.y + shifted!.height / 2);
  await page.mouse.down();
  await page.mouse.move(shifted!.x + 112, shifted!.y + shifted!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId("roll-note").getAttribute("data-time"))).toBeGreaterThan(time + 0.4);
  expect(Number(await page.getByTestId("roll-note").getAttribute("data-duration"))).toBeCloseTo(held, 2);
  expect(Number(await page.getByTestId("roll-note").getAttribute("data-pitch"))).toBe(heldPitch);

  const heard = await page.evaluate(() => (window as unknown as { __heard: number }).__heard);
  await page.getByRole("button", { name: "Play this instrument" }).click();
  await expect(page.getByTestId("listen")).toHaveAttribute("data-part", "on");
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heard: number }).__heard), { timeout: 8_000 }).toBeGreaterThan(heard);
  await page.getByRole("button", { name: "Stop this instrument" }).click();

  await page.getByRole("button", { name: "Save to song" }).click();
  await expect(page.getByRole("button", { name: "Piano track" })).toBeVisible();

  await addAndPick(page, "Piano");
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

  await addAndPick(page, "Drum kit");
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
  await page.getByRole("button", { name: "Stop your song" }).click();
  await page.getByRole("button", { name: "Remove Drum kit" }).click();
  await expect(page.getByRole("button", { name: "Drum kit track" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Piano 1 track" })).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("Add an instrument to get started.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Piano 1 track" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Piano 2 track" })).toHaveCount(0);
});

test("mobile studio path", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: "http://127.0.0.1:4173" });
  const page = await context.newPage();
  await openToday(page);
  await expectStudio(page);
  await expect(page.getByLabel("Tries")).toHaveCount(0);
  await addAndPick(page, "Piano");
  const roll = page.getByTestId("instrument");
  const box = await stableBox(roll);
  expect(box).toBeTruthy();
  await page.touchscreen.tap(box!.x + 120, box!.y + 40);
  const again = await stableBox(roll);
  expect(again).toBeTruthy();
  await page.touchscreen.tap(again!.x + 250, again!.y + 100);
  const notes = page.getByTestId("roll-note");
  await expect(notes).toHaveCount(2);
  const times = await notes.evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-time"))));
  expect(Math.min(...times)).toBeGreaterThan(0.2);
  expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(1);
  await page.goto("/dawdle/#leaderboard");
  await expect(page.getByTestId("board")).toContainText("Finish all five tries");
  await context.close();
});

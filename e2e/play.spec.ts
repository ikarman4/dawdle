import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectInView(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.width).toBeGreaterThan(8);
  expect(box!.height).toBeGreaterThan(8);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + Math.min(box!.width, 40)).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y).toBeLessThan(viewport!.height);
}

async function playExample(page: Page) {
  await page.goto("/dawdle/#play");
  await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
  await expect(page.getByText("Hit play and scrub the 20 seconds.")).toBeVisible();
  await expect(page.getByText("record a full pass over the metronome", { exact: false })).toBeVisible();
  await expect(page.getByText("Five tries. Keep the best percentage.")).toBeVisible();
  await expect(page.getByText("Easy mode nudges")).toBeVisible();
  await expect(page.getByText("Hard mode is the percentage only.")).toBeVisible();
  await expect(page.getByText("Then the board.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Easy" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Hard" })).toBeVisible();
  await page.getByRole("button", { name: "Load the example" }).click();
  await expect(page.getByText("full pass", { exact: true })).toBeVisible();
  await expect(page.getByText("punched-in kicks", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("waveform").getAttribute("data-seconds")))
    .toBeGreaterThan(0.2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}

test("desktop studio path", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await playExample(page);
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  const count = page.getByTestId("count-piano");
  const before = Number((await count.textContent())?.replace(/\D/g, ""));
  await page.getByRole("button", { name: "C4" }).click();
  await page.getByRole("button", { name: "Drop at playhead" }).click();
  await expect(count).toHaveText(`${before + 1} notes`);
  await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
  await page.getByLabel("Your name").fill("River");
  await page.getByRole("button", { name: "Submit try" }).click();
  await expect(page.getByTestId("score")).toContainText("%");
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page.getByTestId("board")).toContainText("River");
});

test("mobile studio path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playExample(page);
  await page.getByRole("button", { name: "Instruments" }).click();
  const sheet = page.getByRole("dialog", { name: "Instruments" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Piano", exact: true }).click();
  const count = page.getByTestId("count-piano");
  const before = Number((await count.textContent())?.replace(/\D/g, ""));
  await page.getByRole("button", { name: "C4" }).click();
  await page.getByRole("button", { name: "Drop at playhead" }).click();
  await expect(count).toHaveText(`${before + 1} notes`);
  await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
  await page.getByRole("button", { name: "Instruments" }).click();
  await page.getByRole("dialog", { name: "Instruments" }).getByRole("button", { name: "Drum kit" }).click();
  const kick = page.getByRole("button", { name: "Kick", exact: true });
  await expect(kick).toBeVisible();
  const kickBox = await kick.boundingBox();
  expect(kickBox!.width).toBeGreaterThanOrEqual(44);
  expect(kickBox!.height).toBeGreaterThanOrEqual(44);
  await kick.click();
  const wave = page.getByTestId("waveform");
  await wave.scrollIntoViewIfNeeded();
  const box = await wave.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 12, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.72, box!.y + box!.height / 2);
  await page.mouse.up();
  expect(Number(await wave.getAttribute("data-seconds"))).toBeGreaterThan(8);
  for (const name of ["Play", "Record", "Hear the song", "Metronome", "Submit try", "Instruments"]) {
    await expectInView(page, page.getByRole("button", { name, exact: true }));
  }
  await expectInView(page, page.getByTestId("timeline"));
  await expectInView(page, page.getByRole("link", { name: "Board" }));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
  await page.getByLabel("Your name").fill("River");
  await page.getByRole("button", { name: "Submit try" }).click();
  await expect(page.getByTestId("score")).toContainText("%");
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page.getByTestId("board")).toContainText("River");
});

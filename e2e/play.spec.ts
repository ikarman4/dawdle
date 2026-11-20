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
  await expect(how.getByText("The song stays quiet while you record.")).toBeVisible();
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
  await page.getByRole("button", { name: "Select instrument" }).click();
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  await expect(page.getByTestId("instrument")).toBeVisible();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "count");
  await expect(page.getByTestId("mode-label")).toContainText("Count");
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "record", { timeout: 8_000 });
  await expect(page.getByTestId("mode-label")).toContainText("Recording. The song is paused.");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByTestId("listen")).toHaveAttribute("data-mode", "listen");
});

test("mobile studio path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openToday(page);
  await expectStudio(page);
  await page.goto("/dawdle/#leaderboard");
  await expect(page.getByTestId("board")).toContainText("Finish all five tries");
});

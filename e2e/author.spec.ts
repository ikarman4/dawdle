import { expect, test } from "@playwright/test";

test("author route lists songs and explains the key file", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dawdle/#author");
  await expect(page.getByRole("heading", { name: "Author" })).toBeVisible();
  await expect(page.getByText("Ian commits the saved file.")).toBeVisible();
  await expect(page.getByLabel("Find a song")).toHaveCount(0);
  const list = page.getByRole("list", { name: "Catalog" });
  const size = await list.evaluate((el) => ({ scroll: el.scrollHeight, view: el.clientHeight, rows: el.querySelectorAll("li").length }));
  expect(size.rows).toBeGreaterThan(2000);
  expect(size.scroll).toBeGreaterThan(size.view + 200);
  await page.getByRole("button", { name: /Tie a Yellow Ribbon/ }).click();
  await expect(page.getByRole("heading", { name: "Tie a Yellow Ribbon Round the Ole Oak Tree" })).toBeVisible();
  await expect(page.getByText("no key yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download scoring key" })).toBeDisabled();
  await expect(page.getByText("src/keys/")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByTestId("author")).toHaveAttribute("data-song", "off");
});

test("a finished day reveals the placeholder sketch", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript((date) => {
    const attempts = Array.from({ length: 5 }, () => ({ raw: 10, events: [] }));
    localStorage.setItem(
      "dawdle-v1",
      JSON.stringify({
        username: "Ada",
        follows: [],
        followers: [],
        tutorialOpen: false,
        days: {
          [date]: {
            mode: "easy",
            modeLocked: true,
            attempts,
            hintCount: 0,
            instrumentsRevealed: false,
            hintSteps: {},
            revealedAll: false,
            locked: true,
            tracks: [],
            revealed: false,
          },
        },
        imports: [],
      }),
    );
  }, today);
  await page.goto("/dawdle/#play");
  const sketch = page.getByTestId("sketch");
  await expect(sketch).toBeVisible();
  await expect(sketch).toHaveAttribute("data-kind", "placeholder");
  await expect(sketch.getByRole("heading", { name: "Placeholder sketch" })).toBeVisible();
  await expect(sketch.getByText("not the original stems")).toBeVisible();
  await expect(sketch.getByTestId("sketch-roll").first()).toBeVisible();
  expect(await sketch.getByTestId("sketch-roll").count()).toBeGreaterThanOrEqual(4);
  const wave = await page.getByTestId("waveform").getAttribute("data-seconds");
  await sketch.getByRole("button", { name: "Play the placeholder sketch" }).click();
  await expect(page.getByTestId("listen")).toHaveAttribute("data-song", "off");
  await expect.poll(async () => Number(await sketch.getByTestId("roll-playhead").first().getAttribute("data-seconds"))).toBeGreaterThan(0.05);
  await expect(page.getByTestId("waveform")).toHaveAttribute("data-seconds", wave);
});

import { expect, test } from "@playwright/test";

// Needs only the Signal Lab web app (the graph runs on in-memory mock data). Run against a live `make dev` with
//   PW_REUSE=1 npx playwright test e2e/ecosystem.spec.ts
const LAB = "http://localhost:3002/ecosystem";

test.describe("FaZe Ecosystem Graph", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LAB);
    await expect(page.getByTestId("counts")).toContainText("relationships", { timeout: 60_000 });
  });

  test("alias search resolves to the canonical person and flags the ambiguous alias", async ({ page }) => {
    const search = page.getByLabel(/Search creators/);
    await search.fill("House Cat");
    await page.getByRole("option").first().click();
    await expect(page.getByTestId("detail-name")).toContainText("FaZe Timid");
    await search.fill("rain");
    await expect(page.getByText(/matches more than one entity/)).toBeVisible();
    await page.getByRole("option").filter({ hasText: "Nordan “FaZe Rain”" }).first().click();
    await expect(page.getByText("Not the Counter-Strike player")).toBeVisible();
  });

  test("moving the timeline back brings an ended role back", async ({ page }) => {
    await page.getByLabel(/Search creators/).fill("Banks");
    await page.getByRole("option").first().click();
    await page.locator('input[type="range"]').fill("167"); // Apr 2024
    await expect(page.getByTestId("asof")).toHaveText("Apr 2024");
    await expect(page.locator("aside li", { hasText: "CEO @ FaZe Clan" }).getByText("at this date")).toBeVisible();
  });

  test("shows only observed ecosystem facts", async ({ page }) => {
    await expect(page.getByTestId("counts")).not.toContainText("simulation shown");
    await expect(page.getByText("Observed FaZe facts only.")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Simulation" })).toHaveCount(0);
  });

  test("uses one live MiroFish workflow without a local backtest", async ({ page }) => {
    await page.getByRole("link", { name: "Decision Lab" }).click();
    await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Backtest" })).toHaveCount(0);
    await expect(page.getByText("Fast demo backtest")).toHaveCount(0);
  });
});

import { test, expect } from "@playwright/test";

const ODYSSEY = "http://localhost:3001";
const LAB = "http://localhost:3002";

test("Drop, vote, close, publish, Final Cut, Sim vs Fans, VOD Review, Partners", async ({ page }) => {
  await page.goto(ODYSSEY);
  await expect(page.getByTestId("this-week")).toContainText("Homecoming Week 1");
  await page.getByRole("link", { name: "Open the Drop" }).click();
  await expect(page.getByTestId("state")).toContainText("open");
  await page.getByRole("button", { name: /Sign in as demo fan/ }).click();
  await expect(page.locator("#signin")).toHaveCount(0);
  await page.getByRole("button", { name: "Vote for A" }).click();
  await expect(page.locator("#result")).toHaveText("Vote recorded");

  await page.goto(`${LAB}/scrims`);
  await page.getByRole("button", { name: "Run fixture scrim" }).click();
  await expect(page.getByTestId("log")).toContainText("Scrim done (fixture model, uncalibrated)");
  await page.getByRole("button", { name: /Register prediction/ }).click();
  await expect(page.getByTestId("log")).toContainText("committed as hash");
  await page.getByRole("button", { name: "Close ballot" }).click();
  await expect(page.getByTestId("log")).toContainText("Ballot closed");
  await page.getByRole("button", { name: "Reveal and publish" }).click();
  await expect(page.getByTestId("log")).toContainText("Published. Final Cut:");

  await page.goto(`${ODYSSEY}/final-cut/homecoming-week1-final-cut`);
  await expect(page.getByTestId("real-tally")).toContainText("Clip A: 1 votes");
  await expect(page.getByTestId("sim-vs-fans")).toContainText("simulated");

  await page.goto(`${LAB}/vod`);
  await expect(page.getByTestId("vod-sim")).toContainText("uncalibrated");
  await page.goto(`${LAB}/partners`);
  await expect(page.getByTestId("partner").first()).toContainText("fictional");
  await page.goto(LAB);
  await expect(page.getByText("Engine online")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ entities/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Scrims" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "VOD Review" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Partners" })).toHaveCount(0);
});

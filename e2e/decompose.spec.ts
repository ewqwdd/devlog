import { expect, type Page, test } from "@playwright/test";

async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByTestId("column-todo")).toBeVisible();
}

// Create a uniquely-titled task via the UI and open its modal.
async function createTaskAndOpen(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  await waitForBoardReady(page);

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("create-submit").click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: title }).first(),
  ).toBeVisible();

  const cards = page.getByTestId("task-card").filter({ hasText: title });
  await cards.last().getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
}

async function subtaskTitles(page: Page): Promise<string[]> {
  const texts = await page.getByTestId("subtask-title").allInnerTexts();
  return texts.map((t) => t.trim());
}

// Unique suffix so re-runs against a reused server don't collide with prior rows.
function uid(): string {
  return Date.now().toString(36);
}

test("decompose -> edit -> save -> persist (happy path)", async ({ page }) => {
  await createTaskAndOpen(page, `Decompose-clear-${uid()}`);

  await page.getByTestId("decompose-button").click();
  await expect(page.getByTestId("decompose-alert")).toBeVisible();
  await expect(page.getByTestId("decompose-draft-row")).toHaveCount(3);

  const rows = page.getByTestId("decompose-draft-row");
  // rename the first draft
  await rows.nth(0).getByTestId("decompose-draft-input").fill("Plan it well");
  // remove the second draft ("Implement the core")
  await rows.nth(1).getByTestId("decompose-draft-remove").click();
  await expect(page.getByTestId("decompose-draft-row")).toHaveCount(2);

  await page.getByTestId("decompose-save").click();

  // preview clears; remaining edited titles become real subtasks, in order
  await expect(page.getByTestId("decompose-preview")).toHaveCount(0);
  await expect
    .poll(async () => await subtaskTitles(page))
    .toEqual(["Plan it well", "Write tests"]);

  await page.reload();
  await expect
    .poll(async () => await subtaskTitles(page))
    .toEqual(["Plan it well", "Write tests"]);
});

test("vague task -> refusal, nothing saved", async ({ page }) => {
  await createTaskAndOpen(page, `vague-${uid()}`);

  await page.getByTestId("decompose-button").click();
  await expect(page.getByTestId("decompose-alert")).toBeVisible();
  await expect(page.getByTestId("decompose-draft-row")).toHaveCount(0);
  await expect(page.getByTestId("decompose-save")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("subtask-item")).toHaveCount(0);
});

test("discard drops the draft (no write)", async ({ page }) => {
  await createTaskAndOpen(page, `Decompose-discard-${uid()}`);

  await page.getByTestId("decompose-button").click();
  await expect(page.getByTestId("decompose-draft-row").first()).toBeVisible();

  await page.getByTestId("decompose-discard").click();
  await expect(page.getByTestId("decompose-preview")).toHaveCount(0);
  await expect(page.getByTestId("subtask-item")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("subtask-item")).toHaveCount(0);
});

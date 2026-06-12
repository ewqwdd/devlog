import { expect, type Page, test } from "@playwright/test";

async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByTestId("column-todo")).toBeVisible();
}

// Create a uniquely-titled task via the UI and open its modal.
// Returns the task id parsed from the /tasks/<id> URL.
async function createTaskAndOpen(page: Page, title: string): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  await waitForBoardReady(page);

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("create-submit").click();
  // Wait for the card with this exact title to appear (use .first() in case of
  // leftover cards from a prior run on the same server instance).
  await expect(
    page.getByTestId("task-card").filter({ hasText: title }).first(),
  ).toBeVisible();

  // Open the most-recently-created card (last in the column).
  const cards = page.getByTestId("task-card").filter({ hasText: title });
  await cards.last().getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
  return page.url().split("/tasks/")[1] ?? "";
}

async function addSubtask(page: Page, title: string): Promise<void> {
  await page.getByTestId("subtask-add-input").fill(title);
  await page.getByTestId("subtask-add-input").press("Enter");
  // Use .first() to avoid strict-mode errors when a prior run left identical
  // subtask titles in the DB (server reuse keeps old data across runs locally).
  await expect(
    page.getByTestId("subtask-item").filter({ hasText: title }).first(),
  ).toBeVisible();
}

async function subtaskTitles(page: Page): Promise<string[]> {
  const texts = await page.getByTestId("subtask-title").allInnerTexts();
  return texts.map((t) => t.trim());
}

// dnd-kit's PointerSensor needs real intermediate pointer moves past the 8px
// activation distance — a single dragTo() will not trigger a drag.
async function dragSubtask(
  page: Page,
  fromTitle: string,
  toTitle: string,
): Promise<void> {
  const handle = page
    .getByTestId("subtask-item")
    .filter({ hasText: fromTitle })
    .first()
    .getByTestId("subtask-drag-handle");
  const target = page
    .getByTestId("subtask-item")
    .filter({ hasText: toTitle })
    .first();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error("drag source/target not found");
  }
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 5 }); // exceed activation distance
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.move(endX, endY + 2, { steps: 3 }); // settle over target
  await page.mouse.up();
}

// Each test gets a unique title suffix so that re-runs against a reused server
// (reuseExistingServer: true) don't collide with leftover rows from prior runs.
function uid(): string {
  return Date.now().toString(36);
}

test("add: subtask appears at the bottom and persists across reload", async ({
  page,
}) => {
  await createTaskAndOpen(page, `Subtasks-add-${uid()}`);
  await page.getByTestId("subtask-add-input").fill("First subtask");
  await page.getByTestId("subtask-add-input").press("Enter");
  await expect(
    page
      .getByTestId("subtask-item")
      .filter({ hasText: "First subtask" })
      .first(),
  ).toBeVisible();

  // roadmap checkpoint: reload -> still there
  await page.reload();
  await expect(
    page
      .getByTestId("subtask-item")
      .filter({ hasText: "First subtask" })
      .first(),
  ).toBeVisible();
});

test("complete: checkbox toggles done and persists across reload", async ({
  page,
}) => {
  await createTaskAndOpen(page, `Subtasks-complete-${uid()}`);
  await addSubtask(page, "Do it");

  const item = page
    .getByTestId("subtask-item")
    .filter({ hasText: "Do it" })
    .first();
  await item.getByTestId("subtask-checkbox").click();
  await expect(item.getByTestId("subtask-checkbox")).toBeChecked();

  // roadmap checkpoint: reload -> still done
  await page.reload();
  const reloaded = page
    .getByTestId("subtask-item")
    .filter({ hasText: "Do it" })
    .first();
  await expect(reloaded.getByTestId("subtask-checkbox")).toBeChecked();
});

test("rename: edit the title inline and it persists", async ({ page }) => {
  await createTaskAndOpen(page, `Subtasks-rename-${uid()}`);
  await addSubtask(page, "Old name");

  const item = page
    .getByTestId("subtask-item")
    .filter({ hasText: "Old name" })
    .first();
  await item.getByTestId("subtask-title").click();
  // Once editing starts the title button is replaced by an <input>; the item
  // locator's hasText filter no longer matches the input's value (input values
  // are not part of text content). Use the page-level locator instead.
  await page.getByTestId("subtask-title-input").fill("New name");
  await page.getByTestId("subtask-title-input").press("Enter");
  await expect(
    page.getByTestId("subtask-item").filter({ hasText: "New name" }).first(),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId("subtask-item").filter({ hasText: "New name" }).first(),
  ).toBeVisible();
});

test("reorder: drag A below B -> order B, A, C; persists", async ({ page }) => {
  await createTaskAndOpen(page, `Subtasks-reorder-${uid()}`);
  // Use distinct titles that are not substrings of each other so hasText
  // filter is unambiguous (e.g. "Apple" does not match "Pineapple").
  await addSubtask(page, "Alpha");
  await addSubtask(page, "Beta");
  await addSubtask(page, "Gamma");

  await dragSubtask(page, "Alpha", "Beta");
  await expect
    .poll(async () => await subtaskTitles(page))
    .toEqual(["Beta", "Alpha", "Gamma"]);

  await page.reload();
  await expect
    .poll(async () => await subtaskTitles(page))
    .toEqual(["Beta", "Alpha", "Gamma"]);
});

test("delete: row disappears and stays gone after reload", async ({ page }) => {
  await createTaskAndOpen(page, `Subtasks-delete-${uid()}`);
  await addSubtask(page, "Doomed");

  await page
    .getByTestId("subtask-item")
    .filter({ hasText: "Doomed" })
    .first()
    .getByTestId("subtask-delete")
    .click();
  await expect(
    page.getByTestId("subtask-item").filter({ hasText: "Doomed" }),
  ).toHaveCount(0);

  // roadmap checkpoint: reload -> still gone
  await page.reload();
  await expect(
    page.getByTestId("subtask-item").filter({ hasText: "Doomed" }),
  ).toHaveCount(0);
});

test("subtasks render on the standalone task page", async ({ page }) => {
  const id = await createTaskAndOpen(page, `Subtasks-standalone-${uid()}`);
  await addSubtask(page, "Visible here");

  await page.goto(`/tasks/${id}`); // standalone (non-intercepted) render
  await expect(
    page
      .getByTestId("subtask-item")
      .filter({ hasText: "Visible here" })
      .first(),
  ).toBeVisible();
});

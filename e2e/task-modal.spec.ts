import { expect, type Page, test } from "@playwright/test";
import { columnTitles } from "./helpers";

// The board is a client component: after navigation/reload it shows loading
// skeletons and fetches via React Query before columns/cards exist in the DOM.
// columnTitles() (allInnerTexts) does not auto-wait, so we must wait for the
// fetched board to settle before reading titles.
async function waitForCardCount(
  page: Page,
  status: "todo" | "in-progress" | "done",
  count: number,
): Promise<void> {
  await expect(
    page.getByTestId(`column-${status}`).getByTestId("task-card"),
  ).toHaveCount(count);
}

// Columns only render once React Query has finished its initial fetch (until
// then a loading skeleton with no column-* testids is shown). Wait for the
// columns before counting/deleting cards, or a 0-count read races the fetch.
async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByTestId("column-todo")).toBeVisible();
  await expect(page.getByTestId("column-in-progress")).toBeVisible();
  await expect(page.getByTestId("column-done")).toBeVisible();
}

async function clearBoard(page: Page): Promise<void> {
  // global-setup resets the shared SQLite db only once per run, so each test
  // must start from an empty board. Delete every card through the UI
  // (hover -> card-delete -> confirm-delete) until none remain.
  await waitForBoardReady(page);
  for (;;) {
    const cards = page.getByTestId("task-card");
    const count = await cards.count();
    if (count === 0) {
      return;
    }
    const first = cards.first();
    await first.hover();
    await first.getByTestId("card-delete").click();
    await page.getByTestId("confirm-delete").click();
    // wait for the optimistic removal to drop the card count by one
    await expect(page.getByTestId("task-card")).toHaveCount(count - 1);
  }
}

async function createTask(
  page: Page,
  title: string,
  status: "todo" | "in-progress" | "done" = "todo",
): Promise<void> {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(title);
  if (status !== "todo") {
    await page.getByTestId("status-select").click();
    await page
      .getByRole("option", {
        name: status === "in-progress" ? "In Progress" : "Done",
      })
      .click();
  }
  await page.getByTestId("create-submit").click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: title }),
  ).toBeVisible();
}

// Open a card's modal by clicking its title button (the first button in the
// card; the hover delete button is hidden until hover and later in the DOM).
async function openCard(page: Page, title: string): Promise<void> {
  await page
    .getByTestId("task-card")
    .filter({ hasText: title })
    .getByRole("button")
    .first()
    .click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  await clearBoard(page);
});

test("open card -> modal at /tasks/<id>; Esc returns to the board", async ({
  page,
}) => {
  await createTask(page, "Openable");
  await openCard(page, "Openable");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await waitForBoardReady(page);
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Openable" }),
  ).toBeVisible();
});

test("autosave: title, description, priority persist after reload", async ({
  page,
}) => {
  await createTask(page, "Editable");
  await openCard(page, "Editable");

  // Each field autosaves on blur/change via a fire-and-forget mutation whose
  // onSuccess invalidates the board query, triggering a refetch. That refetch
  // re-seeds the modal's local title/description state from the server. Editing
  // the next field before the previous save + its refetch have fully settled
  // can let the refetch clobber the in-progress edit (the textarea is reset to
  // the stale server value). So after each edit we wait for the network to go
  // idle (both the updateTaskAction POST and the invalidation refetch) before
  // touching the next field.
  await page.getByTestId("modal-title").fill("Edited title");
  await page.getByTestId("modal-title").blur();
  await page.waitForLoadState("networkidle");

  await page.getByTestId("modal-description").fill("Edited description");
  await page.getByTestId("modal-description").blur();
  await page.waitForLoadState("networkidle");

  await page.getByTestId("modal-priority").click();
  await page.getByRole("option", { name: "High" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("modal-priority")).toContainText("High");

  await page.goto("/");
  await waitForBoardReady(page);
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Edited title" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Editable" }),
  ).toHaveCount(0);

  // Reopen and confirm the persisted field values directly.
  await openCard(page, "Edited title");
  await expect(page.getByTestId("modal-title")).toHaveValue("Edited title");
  await expect(page.getByTestId("modal-description")).toHaveValue(
    "Edited description",
  );
  await expect(page.getByTestId("modal-priority")).toContainText("High");
});

test("status via modal: card moves to the end of the new column", async ({
  page,
}) => {
  await createTask(page, "Mover");
  await openCard(page, "Mover");

  await page.getByTestId("modal-status").click();
  await page.getByRole("option", { name: "Done" }).click();

  // Confirm the move landed before navigating away.
  await expect(page.getByTestId("modal-status")).toContainText("Done");

  await page.goto("/");
  await waitForCardCount(page, "done", 1);
  await waitForCardCount(page, "todo", 0);
  expect(await columnTitles(page, "done")).toContain("Mover");
  expect(await columnTitles(page, "todo")).not.toContain("Mover");
});

test("delete from modal: confirm -> modal closes, card gone after reload", async ({
  page,
}) => {
  await createTask(page, "Deletable");
  await openCard(page, "Deletable");

  await page.getByTestId("modal-delete").click();
  await page.getByTestId("modal-confirm-delete").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Deletable" }),
  ).toHaveCount(0);
  await page.reload();
  await waitForBoardReady(page);
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Deletable" }),
  ).toHaveCount(0);
});

test("delete from card: hover delete -> confirm -> card gone", async ({
  page,
}) => {
  await createTask(page, "CardDel");
  const card = page.getByTestId("task-card").filter({ hasText: "CardDel" });
  await card.hover();
  await card.getByTestId("card-delete").click();
  await page.getByTestId("confirm-delete").click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: "CardDel" }),
  ).toHaveCount(0);
});

test("direct link renders the standalone task page; unknown id 404s", async ({
  page,
}) => {
  await createTask(page, "Direct");
  await openCard(page, "Direct");
  const url = page.url();
  await page.goto(url); // standalone (non-intercepted) render
  await expect(page.getByTestId("modal-title")).toHaveValue("Direct");

  await page.goto("/tasks/00000000-0000-0000-0000-000000000000");
  await expect(page.locator("body")).toContainText(/not found|404/i);
});

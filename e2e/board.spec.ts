import { expect, type Page, test } from "@playwright/test";
import { columnTitles, dragCard } from "./helpers";

// The board is a client component: after navigation/reload it shows loading
// skeletons and fetches via React Query before any card exists in the DOM.
// columnTitles() (allInnerTexts) does not auto-wait, so we must wait for the
// fetched board to settle before reading titles. Wait until the expected card
// count is present in each column.
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
  opts: {
    title: string;
    status?: "todo" | "in-progress" | "done";
    priority?: "low" | "medium" | "high";
  },
): Promise<void> {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(opts.title);
  if (opts.status) {
    await page.getByTestId("status-select").click();
    await page
      .getByRole("option", {
        name: { todo: "Todo", "in-progress": "In Progress", done: "Done" }[
          opts.status
        ],
      })
      .click();
  }
  if (opts.priority) {
    await page.getByTestId("priority-select").click();
    await page
      .getByRole("option", {
        name: { low: "Low", medium: "Medium", high: "High" }[opts.priority],
      })
      .click();
  }
  await page.getByTestId("create-submit").click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: opts.title }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  await clearBoard(page);
});

test("create: new task appears at the bottom of its column and persists", async ({
  page,
}) => {
  await createTask(page, { title: "Existing IP", status: "in-progress" });
  await createTask(page, {
    title: "Fresh task",
    status: "in-progress",
    priority: "high",
  });

  expect(await columnTitles(page, "in-progress")).toEqual([
    "Existing IP",
    "Fresh task",
  ]);

  await page.reload();
  await waitForCardCount(page, "in-progress", 2);
  expect(await columnTitles(page, "in-progress")).toEqual([
    "Existing IP",
    "Fresh task",
  ]);
});

test("create validation: empty title shows an error and adds no card", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("create-submit").click();
  await expect(page.getByTestId("form-error")).toBeVisible();
  await expect(page.getByTestId("title-input")).toBeVisible();
});

test("drag cross-column: card lands at the exact index and persists", async ({
  page,
}) => {
  await createTask(page, { title: "T-only", status: "todo" });
  await createTask(page, { title: "IP-1", status: "in-progress" });
  await createTask(page, { title: "IP-2", status: "in-progress" });

  await dragCard(page, "T-only", { type: "card", title: "IP-2" });

  await expect(
    page.getByTestId("column-in-progress").getByTestId("task-card"),
  ).toHaveCount(3);
  await waitForCardCount(page, "todo", 0);
  const order = await columnTitles(page, "in-progress");
  expect(order).toContain("T-only");
  expect(order.indexOf("T-only")).toBeLessThan(order.indexOf("IP-2"));
  expect(await columnTitles(page, "todo")).toEqual([]);

  await page.reload();
  await waitForCardCount(page, "in-progress", 3);
  const persisted = await columnTitles(page, "in-progress");
  expect(persisted).toContain("T-only");
  expect(persisted.indexOf("T-only")).toBeLessThan(persisted.indexOf("IP-2"));
});

test("drag in-column: bottom card moves to the top and persists", async ({
  page,
}) => {
  await createTask(page, { title: "Top", status: "todo" });
  await createTask(page, { title: "Middle", status: "todo" });
  await createTask(page, { title: "Bottom", status: "todo" });

  await dragCard(page, "Bottom", { type: "card", title: "Top" });

  // The reorder keeps the card count, so wait via expect.poll until the first
  // title settles to "Bottom" (the drop + state update is not instantaneous).
  await expect
    .poll(
      async (): Promise<string | undefined> =>
        (await columnTitles(page, "todo"))[0],
    )
    .toBe("Bottom");

  await page.reload();
  await waitForCardCount(page, "todo", 3);
  await expect
    .poll(
      async (): Promise<string | undefined> =>
        (await columnTitles(page, "todo"))[0],
    )
    .toBe("Bottom");
});

test("drag into an empty column: card lands there and persists", async ({
  page,
}) => {
  await createTask(page, { title: "Lonely", status: "todo" });

  await dragCard(page, "Lonely", { type: "column", status: "done" });

  // Wait for the drop to settle (card lands in done, todo empties) before
  // reading titles — columnTitles() does not auto-wait.
  await waitForCardCount(page, "done", 1);
  await waitForCardCount(page, "todo", 0);
  expect(await columnTitles(page, "done")).toEqual(["Lonely"]);
  expect(await columnTitles(page, "todo")).toEqual([]);

  await page.reload();
  await waitForCardCount(page, "done", 1);
  expect(await columnTitles(page, "done")).toEqual(["Lonely"]);
});

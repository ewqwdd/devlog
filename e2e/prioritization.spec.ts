import { expect, type Page, test } from "@playwright/test";
import { clearBoard, createTask } from "./helpers";

async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForBoardReady(page);
  await clearBoard(page);
});

test("standalone: recommend a task and navigate to it", async ({ page }) => {
  await createTask(page, { title: "Resume me", status: "in-progress" });
  await createTask(page, {
    title: "Start later",
    status: "todo",
    priority: "high",
  });

  await page.getByRole("button", { name: "What should I work on?" }).click();
  await expect(page.getByTestId("prioritization-dialog")).toBeVisible();

  const link = page.getByTestId("recommended-task-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/Resume me/);

  await page.getByTestId("go-to-task").click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
});

test("chat: 'what should I start with?' renders a tool card and a linked reply", async ({
  page,
}) => {
  await createTask(page, { title: "Resume me", status: "in-progress" });

  await page.getByTestId("chat-input").fill("what should I start with?");
  await page.getByTestId("chat-input").press("Enter");

  await expect(page.getByTestId("tool-card").first()).toBeVisible();
  const link = page.getByTestId("message-html").getByRole("link").first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/tasks\/[0-9a-f-]{36}$/);
});

test("no-tasks: empty pool shows the nothing-to-do message", async ({
  page,
}) => {
  // beforeEach cleared the board, so the pool is empty.
  await page.getByRole("button", { name: "What should I work on?" }).click();
  await expect(page.getByTestId("prioritization-dialog")).toBeVisible();
  await expect(page.getByTestId("prioritization-empty")).toBeVisible();
});

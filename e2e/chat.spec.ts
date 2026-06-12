import { expect, type Page, test } from "@playwright/test";

async function waitForChatReady(page: Page): Promise<void> {
  await expect(page.getByTestId("chat-input")).toBeVisible();
}

test("create flow front-to-back: card on board without reload, link opens modal", async ({
  page,
}) => {
  await page.goto("/");
  await waitForChatReady(page);

  await page.getByTestId("chat-input").fill("create: Buy milk");
  await page.getByTestId("chat-input").press("Enter");

  // status line shows progress (Thinking… then Using createTask…)
  await expect(page.getByTestId("chat-status")).toHaveText(/Thinking|Using/);

  // the createTask tool card appears
  await expect(page.getByTestId("tool-card").first()).toBeVisible();

  // the assistant reply renders with the task link
  const link = page.getByTestId("message-html").getByRole("link").first();
  await expect(link).toBeVisible();

  // the board shows the new card WITHOUT a reload
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Buy milk" }).first(),
  ).toBeVisible();

  // clicking the task link opens the modal over the board; chat history survives
  await link.click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
  await expect(
    page
      .getByTestId("chat-message")
      .filter({ hasText: "create: Buy milk" })
      .first(),
  ).toBeVisible();
});

test("error + recovery: readable error line, then chat stays usable", async ({
  page,
}) => {
  await page.goto("/");
  await waitForChatReady(page);

  await page.getByTestId("chat-input").fill("error: boom");
  await page.getByTestId("chat-input").press("Enter");
  await expect(page.getByTestId("chat-error")).toBeVisible();

  await page.getByTestId("chat-input").fill("how many tasks?");
  await page.getByTestId("chat-input").press("Enter");
  await expect(page.getByTestId("tool-card").first()).toBeVisible();
  await expect(page.getByTestId("message-html").first()).toBeVisible();
});

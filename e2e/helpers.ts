import type { Locator, Page } from "@playwright/test";
import type { TaskStatus } from "@/shared/types/task";

function cardByTitle(page: Page, title: string): Locator {
  return page.getByTestId("task-card").filter({ hasText: title }).first();
}

// dnd-kit's PointerSensor needs real intermediate pointer moves past the
// activation distance (8px) — a single dragTo() will not trigger a drag.
export async function dragCard(
  page: Page,
  cardTitle: string,
  target:
    | { type: "card"; title: string }
    | { type: "column"; status: TaskStatus },
): Promise<void> {
  const source = cardByTitle(page, cardTitle);
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error(`drag source not found: ${cardTitle}`);
  }

  const targetLocator =
    target.type === "card"
      ? cardByTitle(page, target.title)
      : page.getByTestId(`column-${target.status}`);
  const targetBox = await targetLocator.boundingBox();
  if (!targetBox) {
    throw new Error("drag target not found");
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 5 }); // exceed activation distance
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.move(endX, endY + 2, { steps: 3 }); // settle over target
  await page.mouse.up();
}

export async function columnTitles(
  page: Page,
  status: TaskStatus,
): Promise<string[]> {
  const cards = page.getByTestId(`column-${status}`).getByTestId("task-card");
  const titles = await cards.allInnerTexts();
  // strip the priority badge text on the second line
  return titles.map((t): string => t.split("\n")[0]?.trim() ?? "");
}

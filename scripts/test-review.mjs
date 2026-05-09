import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

function transpile(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
}

const output = transpile(resolve(process.cwd(), "src/lib/review.ts"));
const {
  appendReviewIdeaToContent,
  applyReviewAction,
  createEmptyReviewState,
  ensureDailyReview,
  getDailyReviewCards,
  getDailyReviewProgress
} = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

const now = new Date(2026, 4, 3, 9).getTime();
const yesterday = now - 24 * 60 * 60 * 1000;
const today = now - 60 * 60 * 1000;
const settings = {
  autoSyncToDaily: false,
  dailyNotebookId: "",
  viewMode: "list",
  sortMode: "createdDesc",
  dailyReviewEnabled: true,
  dailyReviewLimit: 2
};
const cards = [
  {
    id: "old-pinned",
    title: "旧置顶卡",
    content: "值得回顾",
    tags: ["思考"],
    createdAt: yesterday - 2 * 24 * 60 * 60 * 1000,
    updatedAt: yesterday,
    pinned: true
  },
  {
    id: "old",
    title: "旧卡",
    content: "普通回顾",
    tags: [],
    createdAt: yesterday,
    updatedAt: yesterday,
    pinned: false
  },
  {
    id: "today",
    title: "今日新卡",
    content: "今天先不推",
    tags: [],
    createdAt: today,
    updatedAt: today,
    pinned: false
  }
];

let draft = ensureDailyReview(cards, createEmptyReviewState(), settings, now);
assert.equal(draft.changed, true);
assert.deepEqual(getDailyReviewCards(cards, draft.state, settings, now).map((card) => card.id), ["old-pinned", "old"]);
assert.deepEqual(getDailyReviewProgress(draft.state, now), { total: 2, completed: 0 });

const stableDraft = ensureDailyReview(cards, draft.state, settings, now);
assert.equal(stableDraft.changed, false);
assert.deepEqual(getDailyReviewCards(cards, stableDraft.state, settings, now).map((card) => card.id), ["old-pinned", "old"]);

let reviewedState = applyReviewAction(draft.state, "old-pinned", "reviewed", now);
assert.deepEqual(getDailyReviewCards(cards, reviewedState, settings, now).map((card) => card.id), ["old"]);
assert.deepEqual(getDailyReviewProgress(reviewedState, now), { total: 2, completed: 1 });
assert.ok(reviewedState.cards["old-pinned"].nextReviewAt > now);

reviewedState = applyReviewAction(reviewedState, "old", "dismissToday", now);
assert.deepEqual(getDailyReviewCards(cards, reviewedState, settings, now), []);

assert.equal(
  appendReviewIdeaToContent("原始内容", "今天想到一条新连接", now),
  "原始内容\n\n> 回顾想法 2026-05-03 09:00\n> 今天想到一条新连接"
);
assert.equal(
  appendReviewIdeaToContent("", "第一行\n\n第二行", now),
  "> 回顾想法 2026-05-03 09:00\n> 第一行\n>\n> 第二行"
);

console.log("review tests passed");

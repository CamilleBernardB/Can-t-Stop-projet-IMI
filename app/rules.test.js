const assert = require("node:assert/strict");
require("./app.js");

const rules = globalThis.CantStopRules;

function sortedActions(actions) {
  return actions.map((action) => action.join("-")).sort();
}

function progressWith(overrides = {}) {
  return { ...rules.makeEmptyProgress(), ...overrides };
}

{
  const progress = progressWith();
  const temp = { 5: 1, 8: 2, 9: 1 };
  const next = rules.applyAction([5, 11], progress, temp);

  assert.deepEqual(rules.listOpenColumns(next), [5, 8, 9]);
  assert.equal(next[5], 2);
  assert.equal(next[11], undefined);
}

{
  const progress = progressWith();
  const temp = { 5: 1, 8: 2, 9: 1 };
  const legal = rules.legalActionsForRoll([1, 1, 5, 5], progress, temp);

  assert.deepEqual(legal, []);
}

{
  const progress = progressWith();
  const temp = { 5: 1, 8: 2, 9: 1 };
  const legal = rules.legalActionsForRoll([2, 3, 5, 6], progress, temp);

  assert.deepEqual(sortedActions(legal), ["8-8"]);
}

{
  const progress = progressWith();
  const temp = {};
  const legal = rules.legalActionsForRoll([2, 3, 5, 6], progress, temp, [5]);

  assert.equal(sortedActions(legal).includes("5"), false);
  assert.equal(sortedActions(legal).includes("8-8"), true);
}

{
  const progress = progressWith();
  const temp = { 6: 2, 8: 1, 10: 1 };
  const legal = rules.legalActionsForRoll([2, 3, 4, 6], progress, temp, [5, 7]);

  assert.deepEqual(sortedActions(legal), []);
}

{
  const progress = progressWith();
  const temp = { 5: 1, 8: 2 };
  const choices = rules.getActionChoices([9, 10], progress, temp);

  assert.deepEqual(sortedActions(choices), []);
}

{
  const progress = progressWith({ 5: 3 });
  const temp = { 6: 1, 7: 1, 8: 1 };
  const legal = rules.legalActionsForRoll([2, 3, 5, 6], progress, temp);

  assert.deepEqual(sortedActions(legal), ["8-8"]);
}

{
  let progress = progressWith();
  let temp = {};

  temp = rules.applyAction([5, 7], progress, temp);
  temp = rules.applyAction([7, 7], progress, temp);
  temp = rules.applyAction([5, 6], progress, temp);
  temp = rules.applyAction([7], progress, temp);
  assert.deepEqual(rules.listOpenColumns(temp), [5, 6, 7]);

  progress = rules.bankProgress(progress, temp);
  temp = {};
  temp = rules.applyAction([6, 10], progress, temp);

  assert.deepEqual(rules.listOpenColumns(temp), [6, 10]);
  assert.equal(rules.countOpenColumns(temp), 2);
  assert.equal(progress[5] > 0 && progress[6] > 0 && progress[7] > 0, true);
}

{
  const allRolls = [];
  for (let d1 = 1; d1 <= 6; d1 += 1) {
    for (let d2 = 1; d2 <= 6; d2 += 1) {
      for (let d3 = 1; d3 <= 6; d3 += 1) {
        for (let d4 = 1; d4 <= 6; d4 += 1) {
          allRolls.push([d1, d2, d3, d4]);
        }
      }
    }
  }

  const progress = progressWith();
  const temp = { 5: 2, 6: 1, 7: 3 };

  for (const roll of allRolls) {
    for (const action of rules.legalActionsForRoll(roll, progress, temp)) {
      assert.equal(action.length, 2, `single-column action allowed for ${roll}`);
      const next = rules.applyAction(action, progress, temp);
      assert.equal(rules.countOpenColumns(next) <= 3, true, `opened too many columns for ${roll}`);
      for (const column of rules.listOpenColumns(next)) {
        assert.equal([5, 6, 7].includes(column), true, `opened column ${column} from ${roll}`);
      }
    }
  }
}

console.log("All Can't Stop rule tests passed.");

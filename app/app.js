(() => {
  "use strict";

  const COLUMNS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const NS = {
    2: 3,
    3: 5,
    4: 7,
    5: 9,
    6: 11,
    7: 13,
    8: 11,
    9: 9,
    10: 7,
    11: 5,
    12: 3,
  };

  const MAX_DUEL_TURNS = 650;
  const MAX_ROLLS_PER_TURN = 120;
  const SOLO_SCORE_KEY = "cantStopSoloScores";
  const MARKER_PENALTY_H2 = 0.15;

  const ALL_ROLLS = buildAllRolls();
  const PROB_COL = computeColumnProbabilities();

  const state = {
    soloGame: null,
    duelGame: null,
    twoPlayerGame: null,
    homeTimer: null,
  };

  function makeEmptyProgress() {
    return Object.fromEntries(COLUMNS.map((column) => [column, 0]));
  }

  function cloneMap(map) {
    return { ...map };
  }

  function countWonColumns(progress) {
    return COLUMNS.filter((column) => progress[column] >= NS[column]).length;
  }

  function countOpenColumns(tempProgress) {
    return Object.keys(tempProgress).length;
  }

  function listOpenColumns(tempProgress) {
    return Object.keys(tempProgress)
      .map(Number)
      .sort((a, b) => a - b);
  }

  function getPairings(roll) {
    const [d1, d2, d3, d4] = roll;
    const raw = [
      [d1 + d2, d3 + d4],
      [d1 + d3, d2 + d4],
      [d1 + d4, d2 + d3],
    ].map(sortAction);

    const seen = new Set();
    const unique = [];
    raw.forEach((pair) => {
      const key = actionKey(pair);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(pair);
      }
    });
    return unique;
  }

  function sortAction(action) {
    return [...action].sort((a, b) => a - b);
  }

  function actionKey(action) {
    return action.join("-");
  }

  function toBlockedSet(blockedColumns = []) {
    if (blockedColumns instanceof Set) {
      return blockedColumns;
    }
    return new Set(blockedColumns.map(Number));
  }

  function simulateActionSequence(action, progress, tempProgress, blockedColumns = []) {
    const nextTemp = cloneMap(tempProgress);
    const openColumns = new Set(Object.keys(nextTemp).map(Number));
    const blocked = toBlockedSet(blockedColumns);
    const applied = [];

    for (const column of action) {
      if (blocked.has(column)) {
        return null;
      }

      const currentPosition = progress[column] + (nextTemp[column] || 0);

      if (currentPosition >= NS[column]) {
        return null;
      }

      if (!openColumns.has(column)) {
        if (openColumns.size >= 3) {
          return null;
        }
        openColumns.add(column);
      }

      nextTemp[column] = (nextTemp[column] || 0) + 1;
      applied.push(column);
    }

    return applied;
  }

  function getActionChoices(action, progress, tempProgress, blockedColumns = []) {
    const fullAction = simulateActionSequence(action, progress, tempProgress, blockedColumns);

    if (fullAction) {
      return [fullAction];
    }

    const choices = [];
    const seen = new Set();

    action.forEach((column) => {
      const singleAction = simulateActionSequence([column], progress, tempProgress, blockedColumns);
      if (!singleAction) {
        return;
      }

      const key = actionKey(singleAction);
      if (!seen.has(key)) {
        seen.add(key);
        choices.push(singleAction);
      }
    });

    return choices;
  }

  function actionIsLegal(action, progress, tempProgress, blockedColumns = []) {
    return getActionChoices(action, progress, tempProgress, blockedColumns).length > 0;
  }

  function legalActionsForRoll(roll, progress, tempProgress, blockedColumns = []) {
    const seen = new Set();
    const legalActions = [];

    getPairings(roll).forEach((action) => {
      getActionChoices(action, progress, tempProgress, blockedColumns).forEach((choice) => {
        const key = actionKey(choice);
        if (!seen.has(key)) {
          seen.add(key);
          legalActions.push(choice);
        }
      });
    });

    return legalActions;
  }

  function assertTempProgressInvariant(tempProgress) {
    const openColumns = listOpenColumns(tempProgress);

    if (openColumns.length > 3) {
      throw new Error(`Too many neutral markers opened: ${openColumns.join(", ")}`);
    }

    return tempProgress;
  }

  function applyAction(action, progress, tempProgress, blockedColumns = []) {
    const nextTemp = assertTempProgressInvariant(cloneMap(tempProgress));
    const openColumns = new Set(Object.keys(nextTemp).map(Number));
    const blocked = toBlockedSet(blockedColumns);

    for (const column of action) {
      if (blocked.has(column)) {
        continue;
      }

      const currentPosition = progress[column] + (nextTemp[column] || 0);

      if (currentPosition < NS[column]) {
        if (!openColumns.has(column)) {
          if (openColumns.size >= 3) {
            continue;
          }
          openColumns.add(column);
        }

        nextTemp[column] = (nextTemp[column] || 0) + 1;

        if (progress[column] + nextTemp[column] > NS[column]) {
          nextTemp[column] = NS[column] - progress[column];
        }
      }
    }

    return assertTempProgressInvariant(nextTemp);
  }

  function bankProgress(progress, tempProgress) {
    const nextProgress = cloneMap(progress);

    Object.entries(tempProgress).forEach(([column, increment]) => {
      nextProgress[column] = Math.min(nextProgress[column] + increment, NS[column]);
    });

    return nextProgress;
  }

  function capturedColumnsFromOwners(columnOwners) {
    return Object.keys(columnOwners).map(Number);
  }

  function countCapturedByPlayer(columnOwners, playerId) {
    return Object.values(columnOwners).filter((owner) => owner === playerId).length;
  }

  function buildAllRolls() {
    const rolls = [];
    for (let d1 = 1; d1 <= 6; d1 += 1) {
      for (let d2 = 1; d2 <= 6; d2 += 1) {
        for (let d3 = 1; d3 <= 6; d3 += 1) {
          for (let d4 = 1; d4 <= 6; d4 += 1) {
            rolls.push([d1, d2, d3, d4]);
          }
        }
      }
    }
    return rolls;
  }

  function computeColumnProbabilities() {
    const probabilities = {};
    COLUMNS.forEach((target) => {
      const hits = ALL_ROLLS.filter((roll) =>
        getPairings(roll).some((action) => action.includes(target)),
      ).length;
      probabilities[target] = hits / 1296;
    });
    return probabilities;
  }

  function countByColumn(action) {
    return action.reduce((counts, column) => {
      counts[column] = (counts[column] || 0) + 1;
      return counts;
    }, {});
  }

  function columnMoveWeight(column) {
    return 6 - Math.abs(7 - column);
  }

  function maxBy(items, scoreFn) {
    return items.reduce((best, item) => (scoreFn(item) > scoreFn(best) ? item : best), items[0]);
  }

  function colValue(column, progress, tempProgress) {
    const current = progress[column] + (tempProgress[column] || 0);
    const remaining = Math.max(NS[column] - current, 1);
    return PROB_COL[column] / remaining;
  }

  function scoreH2(action, progress, tempProgress) {
    const counts = countByColumn(action);
    return Object.entries(counts).reduce((score, [columnText, multiplier]) => {
      const column = Number(columnText);
      const openPenalty = Object.hasOwn(tempProgress, column) ? 0 : MARKER_PENALTY_H2;
      return score + multiplier * colValue(column, progress, tempProgress) - openPenalty;
    }, 0);
  }

  function bustProbabilityAfterAction(action, progress, tempProgress) {
    const hypothetical = applyAction(action, progress, tempProgress);
    const busts = ALL_ROLLS.filter((roll) => legalActionsForRoll(roll, progress, hypothetical).length === 0);
    return busts.length / 1296;
  }

  function chooseActionH1(progress, tempProgress, legalActions) {
    const noOpen = legalActions.filter((action) => action.every((column) => Object.hasOwn(tempProgress, column)));

    if (noOpen.length > 0) {
      return maxBy(noOpen, (action) =>
        action.reduce((score, column) => {
          const remaining = NS[column] - progress[column] - (tempProgress[column] || 0);
          return score + columnMoveWeight(column) + (remaining <= 2 ? 3 : 0);
        }, 0),
      );
    }

    return maxBy(legalActions, (action) =>
      [...new Set(action)].reduce((score, column) => {
        if (Object.hasOwn(tempProgress, column)) {
          return score;
        }
        const remaining = Math.max(NS[column] - progress[column] - (tempProgress[column] || 0), 1);
        return score + PROB_COL[column] / remaining;
      }, 0),
    );
  }

  function chooseActionRuleOf28(progress, tempProgress, legalActions) {
    return maxBy(legalActions, (action) => {
      const counts = countByColumn(action);
      return Object.entries(counts).reduce((value, [columnText, multiplier]) => {
        const column = Number(columnText);
        const opensNewMarker = Object.hasOwn(tempProgress, column) ? 0 : 1;
        return value + multiplier * columnMoveWeight(column) - 6 * opensNewMarker;
      }, 0);
    });
  }

  function shouldStopRuleOf28(tempProgress) {
    const openColumns = listOpenColumns(tempProgress);

    if (openColumns.length === 0) {
      return false;
    }

    let value = openColumns.reduce(
      (score, column) => score + (tempProgress[column] + 1) * (Math.abs(7 - column) + 1),
      0,
    );

    if (openColumns.length === 3) {
      const allOdd = openColumns.every((column) => column % 2 === 1);
      const allEven = openColumns.every((column) => column % 2 === 0);
      const allHigh = openColumns.every((column) => column >= 7);
      const allLow = openColumns.every((column) => column <= 7);

      if (allOdd) value += 2;
      if (allEven) value -= 2;
      if (allHigh) value += 4;
      if (allLow) value += 4;
    }

    return value >= 28;
  }

  function makeMaxStepsStopK(k) {
    return ({ progress, tempProgress, legalActions, turnRollCount }) => {
      const action = maxBy(legalActions, (candidate) =>
        candidate.reduce((score, column) => {
          const currentPosition = progress[column] + (tempProgress[column] || 0);
          const remaining = NS[column] - currentPosition;
          const finishBonus = remaining <= 2 ? 3 : 0;
          const openPenalty = Object.hasOwn(tempProgress, column) ? 0 : 1;
          return score + columnMoveWeight(column) + finishBonus - openPenalty;
        }, 0),
      );

      return { action, stop: turnRollCount >= k };
    };
  }

  const HEURISTICS = {
    randomStop4: {
      name: "Aléatoire, stop 4",
      decide: ({ legalActions, turnRollCount, rng }) => ({
        action: legalActions[Math.floor(rng() * legalActions.length)],
        stop: turnRollCount >= 4,
      }),
    },
    rule28: {
      name: "Rule of 28",
      decide: ({ progress, tempProgress, legalActions }) => {
        const action = chooseActionRuleOf28(progress, tempProgress, legalActions);
        const nextTemp = applyAction(action, progress, tempProgress);
        return { action, stop: shouldStopRuleOf28(nextTemp) };
      },
    },
    max1: { name: "Max steps, stop 1", decide: makeMaxStepsStopK(1) },
    max2: { name: "Max steps, stop 2", decide: makeMaxStepsStopK(2) },
    max3: { name: "Max steps, stop 3", decide: makeMaxStepsStopK(3) },
    h1: {
      name: "H1 minimiser ouvertures",
      decide: ({ progress, tempProgress, legalActions, turnRollCount }) => ({
        action: chooseActionH1(progress, tempProgress, legalActions),
        stop: turnRollCount >= 3,
      }),
    },
    h2: {
      name: "H2 probabilités / restants",
      decide: ({ progress, tempProgress, legalActions, turnRollCount }) => ({
        action: maxBy(legalActions, (action) => scoreH2(action, progress, tempProgress)),
        stop: turnRollCount >= 3,
      }),
    },
    h3: {
      name: "H3 minimiser bust",
      decide: ({ progress, tempProgress, legalActions, turnRollCount }) => {
        const scored = legalActions.map((action) => ({
          action,
          bust: bustProbabilityAfterAction(action, progress, tempProgress),
          fallback: scoreH2(action, progress, tempProgress),
        }));
        scored.sort((a, b) => a.bust - b.bust || b.fallback - a.fallback);
        return { action: scored[0].action, stop: turnRollCount >= 3 };
      },
    },
  };

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomDie(rng) {
    return 1 + Math.floor(rng() * 6);
  }

  function randomRoll(rng = Math.random) {
    return [randomDie(rng), randomDie(rng), randomDie(rng), randomDie(rng)];
  }

  function makeRollSchedule(seed) {
    const rng = mulberry32(seed);
    const matrix = Array.from({ length: MAX_DUEL_TURNS }, () =>
      Array.from({ length: MAX_ROLLS_PER_TURN }, () => randomRoll(rng)),
    );
    return { seed, matrix };
  }

  function fallbackScheduledRoll(seed, turnIndex, rollIndex) {
    const rng = mulberry32((seed ^ Math.imul(turnIndex + 17, 1000003) ^ Math.imul(rollIndex + 31, 9176)) >>> 0);
    return randomRoll(rng);
  }

  function getScheduledRoll(schedule, turnIndex, rollIndex) {
    return schedule.matrix[turnIndex]?.[rollIndex] || fallbackScheduledRoll(schedule.seed, turnIndex, rollIndex);
  }

  function simulateHeuristic(heuristicId, schedule) {
    const heuristic = HEURISTICS[heuristicId];
    const rng = mulberry32((schedule.seed ^ 0xa53c91) >>> 0);
    let progress = makeEmptyProgress();
    let turnCount = 0;
    const log = [];

    while (countWonColumns(progress) < 3 && turnCount < 1000) {
      let tempProgress = {};
      let rollCount = 0;
      let turnResolved = false;

      while (rollCount < 300) {
        const roll = getScheduledRoll(schedule, turnCount, rollCount);
        rollCount += 1;
        const legalActions = legalActionsForRoll(roll, progress, tempProgress);

        if (legalActions.length === 0) {
          log.push(`Tour ${turnCount + 1}: bust après ${rollCount} jet(s)`);
          tempProgress = {};
          turnCount += 1;
          turnResolved = true;
          break;
        }

        const decision = heuristic.decide({
          progress,
          tempProgress,
          legalActions,
          turnRollCount: rollCount,
          rng,
        });

        tempProgress = applyAction(decision.action, progress, tempProgress);

        if (decision.stop) {
          progress = bankProgress(progress, tempProgress);
          log.push(`Tour ${turnCount + 1}: stop après ${rollCount} jet(s)`);
          turnCount += 1;
          turnResolved = true;
          break;
        }
      }

      if (!turnResolved) {
        progress = bankProgress(progress, tempProgress);
        log.push(`Tour ${turnCount + 1}: stop forcé après ${rollCount} jet(s)`);
        turnCount += 1;
      }
    }

    return {
      heuristicId,
      heuristicName: heuristic.name,
      turns: turnCount,
      progress,
      log,
      completed: countWonColumns(progress),
    };
  }

  function actionFromSelectedDice(roll, selectedIndices) {
    const selectedSum = selectedIndices.reduce((sum, index) => sum + roll[index], 0);
    const remainingSum = roll.reduce((sum, value, index) => (selectedIndices.includes(index) ? sum : sum + value), 0);
    return sortAction([selectedSum, remainingSum]);
  }

  function describeAction(action) {
    if (!action) return "";
    if (action.length === 1) return `${action[0]}`;
    return action[0] === action[1] ? `${action[0]} deux fois` : `${action[0]} et ${action[1]}`;
  }

  function formatColumns(columns) {
    return columns.length > 0 ? columns.join(", ") : "aucune";
  }

  function formatClimbers(tempProgress) {
    const columns = listOpenColumns(tempProgress);
    return columns.length > 0 ? `${columns.length} / 3: ${columns.join(", ")}` : "0 / 3";
  }

  function renderBoard(container, progress, tempProgress) {
    container.innerHTML = COLUMNS.map((column) => {
      const secured = progress[column];
      const temp = tempProgress[column] || 0;
      const current = progress[column] + temp;
      const isClosed = secured >= NS[column];
      const cells = Array.from({ length: NS[column] }, (_, index) => {
        const level = index + 1;
        const classes = ["cell"];
        const hasSecuredMarker = !isClosed && secured > 0 && level === secured;
        const hasCurrentMarker = !isClosed && temp > 0 && level === current;

        if (isClosed) {
          classes.push("completed");
        } else {
          if (level <= secured) {
            classes.push("secured-path");
          }
          if (hasSecuredMarker) {
            classes.push("has-secured-marker");
          }
          if (hasCurrentMarker) {
            classes.push("has-current-marker");
          }
        }
        return `<div class="${classes.join(" ")}" aria-hidden="true"></div>`;
      }).join("");

      return `
        <div class="column" aria-label="Colonne ${column}, hauteur ${NS[column]}">
          <div class="stack">${cells}</div>
          <div class="column-label ${isClosed ? "closed" : ""}">${column}</div>
        </div>
      `;
    }).join("");
  }

  function renderBoardTwoPlayer(container, players, activePlayerId, tempProgress, columnOwners) {
    container.innerHTML = COLUMNS.map((column) => {
      const owner = columnOwners[column] || null;
      const activePlayer = players.find((player) => player.id === activePlayerId);
      const temp = tempProgress[column] || 0;
      const current = activePlayer.progress[column] + temp;
      const cells = Array.from({ length: NS[column] }, (_, index) => {
        const level = index + 1;
        const classes = ["cell", "two-player-cell"];
        const markers = [];

        if (owner) {
          classes.push(`captured-p${owner}`);
        }

        players.forEach((player) => {
          const securedLevel = player.progress[column];
          if (securedLevel > 0 && level === securedLevel) {
            markers.push(`<span class="player-marker secured-marker p${player.id}" aria-hidden="true"></span>`);
          }
        });

        if (!owner && temp > 0 && level === current) {
          markers.push(`<span class="player-marker climber-marker p${activePlayerId}" aria-hidden="true"></span>`);
        }

        return `<div class="${classes.join(" ")}" aria-hidden="true">${markers.join("")}</div>`;
      }).join("");

      return `
        <div class="column" aria-label="Colonne ${column}, hauteur ${NS[column]}">
          <div class="stack">${cells}</div>
          <div class="column-label ${owner ? `claimed p${owner}` : ""}">${column}</div>
        </div>
      `;
    }).join("");
  }

  function renderDice(container, roll, selectedIndices = [], canSelect = false, onDieClick = null) {
    if (!roll) {
      container.innerHTML = [0, 1, 2, 3]
        .map(() => '<div class="die locked" aria-hidden="true">?</div>')
        .join("");
      return;
    }

    container.innerHTML = roll
      .map((value, index) => {
        const selected = selectedIndices.includes(index);
        const tag = canSelect ? "button" : "div";
        const typeAttr = canSelect ? ' type="button"' : "";
        return `<${tag}${typeAttr} class="die ${canSelect ? "selectable" : "locked"} ${
          selected ? "selected" : ""
        }" data-die-index="${index}" aria-label="De ${index + 1}: ${value}">${value}</${tag}>`;
      })
      .join("");

    if (canSelect && onDieClick) {
      container.querySelectorAll(".die").forEach((die) => {
        die.addEventListener("click", () => onDieClick(Number(die.dataset.dieIndex)));
      });
    }
  }

  function getSoloScores() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SOLO_SCORE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }

  function saveSoloScore(turns) {
    const scores = getSoloScores();
    scores.push(turns);
    localStorage.setItem(SOLO_SCORE_KEY, JSON.stringify(scores));
  }

  function average(values) {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  class GameController {
    constructor(root, options) {
      this.root = root;
      this.options = options;
      this.reset();
      this.mount();
      this.render();
    }

    reset() {
      this.progress = makeEmptyProgress();
      this.tempProgress = {};
      this.turnCount = 0;
      this.rollCountInTurn = 0;
      this.currentRoll = null;
      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.legalActions = [];
      this.phase = "idle";
      this.finished = false;
      this.message = this.options.mode === "duel"
        ? "Les dés de cette partie sont déjà fixés pour le joueur et l'heuristique."
        : "Lancez les dés pour commencer.";
      this.messageTone = "";
      this.result = null;
      this.log = [];
    }

    mount() {
      this.root.innerHTML = `
        <div class="game-shell">
          <section class="board-panel" aria-label="Plateau">
            <div class="stats-strip">
              <div class="stat"><span>Tours</span><strong data-stat="turns">0</strong></div>
              <div class="stat"><span>Colonnes gagnées</span><strong data-stat="won">0 / 3</strong></div>
              <div class="stat"><span>Grimpeurs</span><strong data-stat="open">0 / 3</strong></div>
              <div class="stat"><span>Jet du tour</span><strong data-stat="rolls">0</strong></div>
            </div>
            <div class="board" data-board></div>
          </section>
          <aside class="control-panel" aria-label="Commandes">
            <div class="result-banner" data-result></div>
            <div class="panel-block">
              <p class="panel-title">Dés</p>
              <div class="dice-row" data-dice></div>
            </div>
            <div class="panel-block">
              <p class="panel-title">Action</p>
              <div class="message-box" data-message></div>
              <div class="choice-options" data-choice-options></div>
            </div>
            <div class="action-row three">
              <button class="primary-button" type="button" data-roll>Continuer</button>
              <button class="secondary-button" type="button" data-validate>Valider</button>
              <button class="ghost-button" type="button" data-stop>Stop</button>
            </div>
            <button class="secondary-button" type="button" data-reset>Recommencer</button>
            <div class="panel-block" data-scoreboard></div>
            <div class="panel-block">
              <p class="panel-title">Derniers evenements</p>
              <div class="log-list" data-log></div>
            </div>
          </aside>
        </div>
      `;

      this.refs = {
        board: this.root.querySelector("[data-board]"),
        dice: this.root.querySelector("[data-dice]"),
        message: this.root.querySelector("[data-message]"),
        choiceOptions: this.root.querySelector("[data-choice-options]"),
        result: this.root.querySelector("[data-result]"),
        rollButton: this.root.querySelector("[data-roll]"),
        validateButton: this.root.querySelector("[data-validate]"),
        stopButton: this.root.querySelector("[data-stop]"),
        resetButton: this.root.querySelector("[data-reset]"),
        scoreboard: this.root.querySelector("[data-scoreboard]"),
        log: this.root.querySelector("[data-log]"),
        stats: {
          turns: this.root.querySelector('[data-stat="turns"]'),
          won: this.root.querySelector('[data-stat="won"]'),
          open: this.root.querySelector('[data-stat="open"]'),
          rolls: this.root.querySelector('[data-stat="rolls"]'),
        },
      };

      this.refs.rollButton.addEventListener("click", () => this.roll());
      this.refs.validateButton.addEventListener("click", () => this.validateSelection());
      this.refs.stopButton.addEventListener("click", () => this.stopTurn());
      this.refs.resetButton.addEventListener("click", () => {
        this.reset();
        this.render();
      });
    }

    addLog(line) {
      this.log.unshift(line);
      this.log = this.log.slice(0, 10);
    }

    getRoll() {
      if (this.options.schedule) {
        return getScheduledRoll(this.options.schedule, this.turnCount, this.rollCountInTurn);
      }
      return randomRoll();
    }

    roll() {
      if (this.finished || this.phase === "select") {
        return;
      }

      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.currentRoll = this.getRoll();
      this.rollCountInTurn += 1;
      this.legalActions = legalActionsForRoll(this.currentRoll, this.progress, this.tempProgress);

      if (this.legalActions.length === 0) {
        const bustedTurn = this.turnCount + 1;
        this.tempProgress = {};
        this.turnCount += 1;
        this.rollCountInTurn = 0;
        this.phase = "idle";
        this.message = `Bust au tour ${bustedTurn}: aucun choix légal avec ${this.currentRoll.join(
          ", ",
        )}. Retour aux positions protégées.`;
        this.messageTone = "bad";
        this.addLog(`Tour ${bustedTurn}: bust, progression temporaire perdue`);
      } else {
        this.phase = "select";
        this.message = "Sélectionnez deux dés pour former la première somme.";
        this.messageTone = "";
      }

      this.render();
    }

    selectDie(index) {
      if (this.phase !== "select") return;

      if (this.selectedIndices.includes(index)) {
        this.selectedIndices = this.selectedIndices.filter((item) => item !== index);
      } else if (this.selectedIndices.length < 2) {
        this.selectedIndices.push(index);
      } else {
        this.selectedIndices = [this.selectedIndices[1], index];
      }

      this.selectedChoiceIndex = null;
      this.render();
    }

    getSelectedAction() {
      if (!this.currentRoll || this.selectedIndices.length !== 2) {
        return null;
      }
      return actionFromSelectedDice(this.currentRoll, this.selectedIndices);
    }

    getSelectedActionChoices() {
      const action = this.getSelectedAction();
      if (!action) {
        return [];
      }
      return getActionChoices(action, this.progress, this.tempProgress);
    }

    getSelectedEffectiveAction() {
      const choices = this.getSelectedActionChoices();
      if (choices.length === 1) {
        return choices[0];
      }
      if (this.selectedChoiceIndex !== null && choices[this.selectedChoiceIndex]) {
        return choices[this.selectedChoiceIndex];
      }
      return null;
    }

    selectActionChoice(index) {
      this.selectedChoiceIndex = index;
      this.render();
    }

    validateSelection() {
      const action = this.getSelectedAction();
      const effectiveAction = this.getSelectedEffectiveAction();

      if (!action || !effectiveAction) {
        return;
      }

      this.tempProgress = applyAction(effectiveAction, this.progress, this.tempProgress);
      this.phase = "decision";
      this.message =
        actionKey(action) === actionKey(effectiveAction)
          ? `Action appliquée: ${describeAction(effectiveAction)}. Protégez ou continuez.`
          : `Action partielle appliquée: ${describeAction(effectiveAction)} seulement. Protégez ou continuez.`;
      this.messageTone = "good";
      this.addLog(`Tour ${this.turnCount + 1}, jet ${this.rollCountInTurn}: ${describeAction(effectiveAction)}`);
      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.render();
    }

    stopTurn() {
      if (this.finished || Object.keys(this.tempProgress).length === 0) {
        return;
      }

      this.progress = bankProgress(this.progress, this.tempProgress);
      this.tempProgress = {};
      this.turnCount += 1;
      this.rollCountInTurn = 0;
      this.currentRoll = null;
      this.phase = "idle";
      this.message = "Positions protégées. Nouveau tour prêt.";
      this.messageTone = "good";
      this.addLog(`Tour ${this.turnCount}: stop`);

      if (countWonColumns(this.progress) >= 3) {
        this.finish();
      }

      this.render();
    }

    finish() {
      this.finished = true;
      this.phase = "finished";

      if (this.options.mode === "solo") {
        saveSoloScore(this.turnCount);
        this.result = {
          tone: "good",
          text: `Bravo, vous avez réussi le jeu en ${this.turnCount} tours.`,
        };
      } else {
        const heuristicTurns = this.options.heuristicResult.turns;
        const heuristicName = this.options.heuristicResult.heuristicName;
        const won = this.turnCount <= heuristicTurns;
        this.result = {
          tone: won ? "good" : "bad",
          text: won
            ? `Bravo tu as battu l'heuristique ${heuristicName} en ${this.turnCount} tours contre ${heuristicTurns} tours pour l'heuristique.`
            : `Hélas... l'heuristique ${heuristicName} termine en ${heuristicTurns} tours contre ${this.turnCount} tours pour vous.`,
        };
      }
    }

    renderSelectionMessage() {
      const action = this.getSelectedAction();

      if (!action) {
        return this.message;
      }

      const choices = getActionChoices(action, this.progress, this.tempProgress);
      const selectedValues = this.selectedIndices.map((index) => this.currentRoll[index]).join(" + ");
      const remainingValues = this.currentRoll
        .filter((_, index) => !this.selectedIndices.includes(index))
        .join(" + ");

      if (choices.length === 1) {
        const effectiveAction = choices[0];
        if (actionKey(action) === actionKey(effectiveAction)) {
          return `${selectedValues} puis ${remainingValues}: ${describeAction(action)}.`;
        }
        return `${selectedValues} puis ${remainingValues}: ${describeAction(effectiveAction)} seulement, sans ouvrir de colonne impossible.`;
      }

      if (choices.length > 1) {
        return `${selectedValues} puis ${remainingValues}: choisissez le nombre à utiliser.`;
      }

      return `${selectedValues} puis ${remainingValues}: choix impossible avec les colonnes ouvertes.`;
    }

    renderChoiceOptions() {
      const choices = this.phase === "select" ? this.getSelectedActionChoices() : [];

      if (choices.length <= 1) {
        this.refs.choiceOptions.innerHTML = "";
        return;
      }

      this.refs.choiceOptions.innerHTML = choices
        .map(
          (choice, index) =>
            `<button class="choice-button ${
              this.selectedChoiceIndex === index ? "is-active" : ""
            }" type="button" data-choice-index="${index}">${describeAction(choice)}</button>`,
        )
        .join("");

      this.refs.choiceOptions.querySelectorAll("[data-choice-index]").forEach((button) => {
        button.addEventListener("click", () => this.selectActionChoice(Number(button.dataset.choiceIndex)));
      });
    }

    renderScoreboard() {
      if (this.options.mode !== "solo") {
        const result = this.options.heuristicResult;
        this.refs.scoreboard.innerHTML = `
          <p class="panel-title">Adversaire</p>
          <div class="message-box">
            ${result.heuristicName}<br>
          <span class="muted">Score masqué jusqu'à la fin de votre partie.</span>
          </div>
        `;
        return;
      }

      const scores = getSoloScores();
      const bestScores = [...scores].sort((a, b) => a - b).slice(0, 8);
      const avg = average(scores);
      this.refs.scoreboard.innerHTML = `
        <p class="panel-title">Meilleurs scores</p>
        ${
          bestScores.length > 0
            ? `<ol class="score-list">${bestScores.map((score) => `<li>${score} tours</li>`).join("")}</ol>`
            : '<p class="muted">Aucune partie terminée.</p>'
        }
        <p class="muted">Moyenne: ${avg === null ? "n/a" : `${avg.toFixed(1)} tours`}</p>
      `;
    }

    render() {
      assertTempProgressInvariant(this.tempProgress);
      renderBoard(this.refs.board, this.progress, this.tempProgress);
      renderDice(
        this.refs.dice,
        this.currentRoll,
        this.selectedIndices,
        this.phase === "select",
        (index) => this.selectDie(index),
      );

      this.refs.stats.turns.textContent = String(this.turnCount);
      this.refs.stats.won.textContent = `${countWonColumns(this.progress)} / 3`;
      this.refs.stats.open.textContent = formatClimbers(this.tempProgress);
      this.refs.stats.rolls.textContent = String(this.rollCountInTurn);

      this.refs.message.textContent = this.phase === "select" ? this.renderSelectionMessage() : this.message;
      this.refs.message.className = `message-box ${this.messageTone}`;

      const selectedAction = this.getSelectedAction();
      const selectedChoices = this.getSelectedActionChoices();
      const canValidate =
        this.phase === "select" &&
        selectedAction !== null &&
        (selectedChoices.length === 1 ||
          Boolean(
            selectedChoices.length > 1 &&
              this.selectedChoiceIndex !== null &&
              selectedChoices[this.selectedChoiceIndex],
          ));

      this.refs.rollButton.textContent = this.rollCountInTurn === 0 ? "Lancer" : "Continuer";
      this.refs.rollButton.disabled = this.finished || this.phase === "select";
      this.refs.validateButton.disabled = !canValidate;
      this.refs.stopButton.disabled = this.finished || Object.keys(this.tempProgress).length === 0;
      this.renderChoiceOptions();

      if (this.result) {
        this.refs.result.textContent = this.result.text;
        this.refs.result.className = `result-banner show ${this.result.tone}`;
      } else {
        this.refs.result.textContent = "";
        this.refs.result.className = "result-banner";
      }

      this.renderScoreboard();

      this.refs.log.innerHTML = this.log.length
        ? this.log.map((line) => `<div class="log-line">${line}</div>`).join("")
        : '<div class="muted">La partie commence.</div>';
    }
  }

  class TwoPlayerController {
    constructor(root) {
      this.root = root;
      this.reset();
      this.mount();
      this.render();
    }

    reset() {
      this.players = [
        { id: 1, name: "Joueur 1", progress: makeEmptyProgress(), turns: 0 },
        { id: 2, name: "Joueur 2", progress: makeEmptyProgress(), turns: 0 },
      ];
      this.currentPlayerIndex = 0;
      this.columnOwners = {};
      this.tempProgress = {};
      this.rollCountInTurn = 0;
      this.totalTurns = 0;
      this.currentRoll = null;
      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.phase = "idle";
      this.finished = false;
      this.result = null;
      this.message = "Joueur 1 commence. Lancez les dés.";
      this.messageTone = "";
      this.log = [];
    }

    get currentPlayer() {
      return this.players[this.currentPlayerIndex];
    }

    get blockedColumns() {
      return capturedColumnsFromOwners(this.columnOwners);
    }

    mount() {
      this.root.innerHTML = `
        <div class="game-shell">
          <section class="board-panel" aria-label="Plateau 2 joueurs">
            <div class="stats-strip">
              <div class="stat"><span>À jouer</span><strong data-stat="active-player">Joueur 1</strong></div>
              <div class="stat"><span>Grimpeurs</span><strong data-stat="open">0 / 3</strong></div>
              <div class="stat"><span>Colonnes gagnées</span><strong data-stat="claimed">J1 0 - J2 0</strong></div>
              <div class="stat"><span>Jet du tour</span><strong data-stat="rolls">0</strong></div>
            </div>
            <div class="player-legend" aria-label="Légende">
              <span class="legend-item"><span class="legend-dot p1"></span>Joueur 1</span>
              <span class="legend-item"><span class="legend-dot p2"></span>Joueur 2</span>
              <span class="legend-item"><span class="legend-dot climber"></span>Grimpeur actif</span>
            </div>
            <div class="board two-player-board" data-board></div>
          </section>
          <aside class="control-panel" aria-label="Commandes 2 joueurs">
            <div class="result-banner" data-result></div>
            <div class="turn-card" data-turn-card>Tour du Joueur 1</div>
            <div class="panel-block">
              <p class="panel-title">Dés</p>
              <div class="dice-row" data-dice></div>
            </div>
            <div class="panel-block">
              <p class="panel-title">Action</p>
              <div class="message-box" data-message></div>
              <div class="choice-options" data-choice-options></div>
            </div>
            <div class="action-row three">
              <button class="primary-button" type="button" data-roll>Continuer</button>
              <button class="secondary-button" type="button" data-validate>Valider</button>
              <button class="ghost-button" type="button" data-stop>Stop</button>
            </div>
            <button class="secondary-button" type="button" data-reset>Recommencer</button>
            <div class="panel-block">
              <p class="panel-title">Colonnes capturées</p>
              <div class="message-box compact-message" data-captures></div>
            </div>
            <div class="panel-block">
              <p class="panel-title">Derniers événements</p>
              <div class="log-list" data-log></div>
            </div>
          </aside>
        </div>
      `;

      this.refs = {
        board: this.root.querySelector("[data-board]"),
        dice: this.root.querySelector("[data-dice]"),
        message: this.root.querySelector("[data-message]"),
        choiceOptions: this.root.querySelector("[data-choice-options]"),
        result: this.root.querySelector("[data-result]"),
        turnCard: this.root.querySelector("[data-turn-card]"),
        captures: this.root.querySelector("[data-captures]"),
        rollButton: this.root.querySelector("[data-roll]"),
        validateButton: this.root.querySelector("[data-validate]"),
        stopButton: this.root.querySelector("[data-stop]"),
        resetButton: this.root.querySelector("[data-reset]"),
        log: this.root.querySelector("[data-log]"),
        stats: {
          activePlayer: this.root.querySelector('[data-stat="active-player"]'),
          open: this.root.querySelector('[data-stat="open"]'),
          claimed: this.root.querySelector('[data-stat="claimed"]'),
          rolls: this.root.querySelector('[data-stat="rolls"]'),
        },
      };

      this.refs.rollButton.addEventListener("click", () => this.roll());
      this.refs.validateButton.addEventListener("click", () => this.validateSelection());
      this.refs.stopButton.addEventListener("click", () => this.stopTurn());
      this.refs.resetButton.addEventListener("click", () => {
        this.reset();
        this.render();
      });
    }

    addLog(line) {
      this.log.unshift(line);
      this.log = this.log.slice(0, 12);
    }

    switchPlayer() {
      this.currentPlayerIndex = 1 - this.currentPlayerIndex;
      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.currentRoll = null;
      this.rollCountInTurn = 0;
      this.phase = "idle";
    }

    roll() {
      if (this.finished || this.phase === "select") {
        return;
      }

      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.currentRoll = randomRoll();
      this.rollCountInTurn += 1;
      const legalActions = legalActionsForRoll(
        this.currentRoll,
        this.currentPlayer.progress,
        this.tempProgress,
        this.blockedColumns,
      );

      if (legalActions.length === 0) {
        const playerName = this.currentPlayer.name;
        this.currentPlayer.turns += 1;
        this.totalTurns += 1;
        this.tempProgress = {};
        this.message = `${playerName} bust: aucun choix légal avec ${this.currentRoll.join(
          ", ",
        )}. Retour aux positions protégées.`;
        this.messageTone = "bad";
        this.addLog(`${playerName}: bust`);
        this.switchPlayer();
        this.message += ` ${this.currentPlayer.name} joue.`;
      } else {
        this.phase = "select";
        this.message = `${this.currentPlayer.name}: sélectionnez deux dés.`;
        this.messageTone = "";
      }

      this.render();
    }

    selectDie(index) {
      if (this.phase !== "select") return;

      if (this.selectedIndices.includes(index)) {
        this.selectedIndices = this.selectedIndices.filter((item) => item !== index);
      } else if (this.selectedIndices.length < 2) {
        this.selectedIndices.push(index);
      } else {
        this.selectedIndices = [this.selectedIndices[1], index];
      }

      this.selectedChoiceIndex = null;
      this.render();
    }

    getSelectedAction() {
      if (!this.currentRoll || this.selectedIndices.length !== 2) {
        return null;
      }
      return actionFromSelectedDice(this.currentRoll, this.selectedIndices);
    }

    getSelectedActionChoices() {
      const action = this.getSelectedAction();
      if (!action) {
        return [];
      }
      return getActionChoices(action, this.currentPlayer.progress, this.tempProgress, this.blockedColumns);
    }

    getSelectedEffectiveAction() {
      const choices = this.getSelectedActionChoices();
      if (choices.length === 1) {
        return choices[0];
      }
      if (this.selectedChoiceIndex !== null && choices[this.selectedChoiceIndex]) {
        return choices[this.selectedChoiceIndex];
      }
      return null;
    }

    selectActionChoice(index) {
      this.selectedChoiceIndex = index;
      this.render();
    }

    validateSelection() {
      const action = this.getSelectedAction();
      const effectiveAction = this.getSelectedEffectiveAction();

      if (!action || !effectiveAction) {
        return;
      }

      this.tempProgress = applyAction(
        effectiveAction,
        this.currentPlayer.progress,
        this.tempProgress,
        this.blockedColumns,
      );
      this.phase = "decision";
      this.message =
        actionKey(action) === actionKey(effectiveAction)
          ? `${this.currentPlayer.name} avance sur ${describeAction(effectiveAction)}.`
          : `${this.currentPlayer.name} avance seulement sur ${describeAction(effectiveAction)}.`;
      this.messageTone = "good";
      this.addLog(`${this.currentPlayer.name}, jet ${this.rollCountInTurn}: ${describeAction(effectiveAction)}`);
      this.selectedIndices = [];
      this.selectedChoiceIndex = null;
      this.render();
    }

    stopTurn() {
      if (this.finished || Object.keys(this.tempProgress).length === 0) {
        return;
      }

      const player = this.currentPlayer;
      player.progress = bankProgress(player.progress, this.tempProgress);

      const capturedNow = [];
      Object.keys(this.tempProgress).forEach((columnText) => {
        const column = Number(columnText);
        if (!this.columnOwners[column] && player.progress[column] >= NS[column]) {
          this.columnOwners[column] = player.id;
          capturedNow.push(column);
        }
      });

      player.turns += 1;
      this.totalTurns += 1;
      this.tempProgress = {};
      this.addLog(
        capturedNow.length > 0
          ? `${player.name}: stop et capture ${capturedNow.join(", ")}`
          : `${player.name}: stop`,
      );

      if (countCapturedByPlayer(this.columnOwners, player.id) >= 3) {
        this.finished = true;
        this.phase = "finished";
        this.result = {
          tone: "good",
          text: `${player.name} gagne en capturant trois colonnes.`,
        };
        this.message = this.result.text;
        this.messageTone = "good";
        this.render();
        return;
      }

      this.switchPlayer();
      this.message = `${player.name} bloque ses positions. ${this.currentPlayer.name} joue.`;
      this.messageTone = "good";
      this.render();
    }

    renderSelectionMessage() {
      const action = this.getSelectedAction();

      if (!action) {
        return this.message;
      }

      const choices = this.getSelectedActionChoices();
      const selectedValues = this.selectedIndices.map((index) => this.currentRoll[index]).join(" + ");
      const remainingValues = this.currentRoll
        .filter((_, index) => !this.selectedIndices.includes(index))
        .join(" + ");

      if (choices.length === 1) {
        const effectiveAction = choices[0];
        if (actionKey(action) === actionKey(effectiveAction)) {
          return `${selectedValues} puis ${remainingValues}: ${describeAction(action)}.`;
        }
        return `${selectedValues} puis ${remainingValues}: ${describeAction(effectiveAction)} seulement.`;
      }

      if (choices.length > 1) {
        return `${selectedValues} puis ${remainingValues}: choisissez le nombre à utiliser.`;
      }

      return `${selectedValues} puis ${remainingValues}: choix impossible.`;
    }

    renderChoiceOptions() {
      const choices = this.phase === "select" ? this.getSelectedActionChoices() : [];

      if (choices.length <= 1) {
        this.refs.choiceOptions.innerHTML = "";
        return;
      }

      this.refs.choiceOptions.innerHTML = choices
        .map(
          (choice, index) =>
            `<button class="choice-button ${
              this.selectedChoiceIndex === index ? "is-active" : ""
            }" type="button" data-choice-index="${index}">${describeAction(choice)}</button>`,
        )
        .join("");

      this.refs.choiceOptions.querySelectorAll("[data-choice-index]").forEach((button) => {
        button.addEventListener("click", () => this.selectActionChoice(Number(button.dataset.choiceIndex)));
      });
    }

    renderCaptures() {
      const p1 = COLUMNS.filter((column) => this.columnOwners[column] === 1);
      const p2 = COLUMNS.filter((column) => this.columnOwners[column] === 2);
      this.refs.captures.innerHTML = `
        <span class="capture-line p1">Joueur 1: ${p1.length ? p1.join(", ") : "aucune"}</span>
        <span class="capture-line p2">Joueur 2: ${p2.length ? p2.join(", ") : "aucune"}</span>
      `;
    }

    render() {
      assertTempProgressInvariant(this.tempProgress);
      renderBoardTwoPlayer(
        this.refs.board,
        this.players,
        this.currentPlayer.id,
        this.tempProgress,
        this.columnOwners,
      );
      renderDice(
        this.refs.dice,
        this.currentRoll,
        this.selectedIndices,
        this.phase === "select",
        (index) => this.selectDie(index),
      );

      const p1Captured = countCapturedByPlayer(this.columnOwners, 1);
      const p2Captured = countCapturedByPlayer(this.columnOwners, 2);
      this.refs.stats.activePlayer.textContent = this.currentPlayer.name;
      this.refs.stats.open.textContent = formatClimbers(this.tempProgress);
      this.refs.stats.claimed.textContent = `J1 ${p1Captured} - J2 ${p2Captured}`;
      this.refs.stats.rolls.textContent = String(this.rollCountInTurn);
      this.refs.turnCard.textContent = this.finished ? "Partie terminée" : `Tour du ${this.currentPlayer.name}`;

      this.refs.message.textContent = this.phase === "select" ? this.renderSelectionMessage() : this.message;
      this.refs.message.className = `message-box ${this.messageTone}`;

      const selectedAction = this.getSelectedAction();
      const selectedChoices = this.getSelectedActionChoices();
      const canValidate =
        this.phase === "select" &&
        selectedAction !== null &&
        (selectedChoices.length === 1 ||
          Boolean(
            selectedChoices.length > 1 &&
              this.selectedChoiceIndex !== null &&
              selectedChoices[this.selectedChoiceIndex],
          ));

      this.refs.rollButton.textContent = this.rollCountInTurn === 0 ? "Lancer" : "Continuer";
      this.refs.rollButton.disabled = this.finished || this.phase === "select";
      this.refs.validateButton.disabled = !canValidate;
      this.refs.stopButton.disabled = this.finished || Object.keys(this.tempProgress).length === 0;
      this.renderChoiceOptions();
      this.renderCaptures();

      if (this.result) {
        this.refs.result.textContent = this.result.text;
        this.refs.result.className = `result-banner show ${this.result.tone}`;
      } else {
        this.refs.result.textContent = "";
        this.refs.result.className = "result-banner";
      }

      this.refs.log.innerHTML = this.log.length
        ? this.log.map((line) => `<div class="log-line">${line}</div>`).join("")
        : '<div class="muted">La partie commence.</div>';
    }
  }

  function populateHeuristicSelect() {
    const select = document.querySelector("#heuristic-select");
    select.innerHTML = Object.entries(HEURISTICS)
      .map(([id, heuristic]) => `<option value="${id}">${heuristic.name}</option>`)
      .join("");
    select.value = "h2";
  }

  function startSoloGame() {
    const root = document.querySelector("#solo-root");
    state.soloGame = new GameController(root, { mode: "solo" });
  }

  function startDuelGame() {
    const heuristicId = document.querySelector("#heuristic-select").value;
    const seed = Math.floor(Math.random() * 2147483647);
    const schedule = makeRollSchedule(seed);
    const heuristicResult = simulateHeuristic(heuristicId, schedule);
    const root = document.querySelector("#duel-root");

    state.duelGame = new GameController(root, {
      mode: "duel",
      schedule,
      heuristicResult,
    });
  }

  function startTwoPlayerGame() {
    const root = document.querySelector("#two-player-root");
    state.twoPlayerGame = new TwoPlayerController(root);
  }

  function setupNavigation() {
    const buttons = document.querySelectorAll(".nav-button");
    const views = document.querySelectorAll(".view");

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.view;
        buttons.forEach((item) => item.classList.toggle("is-active", item === button));
        views.forEach((view) => view.classList.toggle("is-active", view.id === `${target}-view`));
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function startHomeDemo() {
    const board = document.querySelector("#demo-board");
    const dice = document.querySelector("#demo-dice");
    const caption = document.querySelector("#demo-caption");
    let progress = makeEmptyProgress();
    let tempProgress = {};
    let turnCount = 0;
    let rollCount = 0;
    const schedule = makeRollSchedule(2807);

    const step = () => {
      if (countWonColumns(progress) >= 3 || turnCount > 80) {
        progress = makeEmptyProgress();
        tempProgress = {};
        turnCount = 0;
        rollCount = 0;
      }

      const roll = getScheduledRoll(schedule, turnCount, rollCount);
      rollCount += 1;
      const legalActions = legalActionsForRoll(roll, progress, tempProgress);

      if (legalActions.length === 0) {
        tempProgress = {};
        turnCount += 1;
        rollCount = 0;
        caption.textContent = `Tour ${turnCount}: bust`;
      } else {
        const decision = HEURISTICS.h2.decide({
          progress,
          tempProgress,
          legalActions,
          turnRollCount: rollCount,
          rng: Math.random,
        });
        tempProgress = applyAction(decision.action, progress, tempProgress);
        caption.textContent = `H2 joue ${describeAction(decision.action)}`;

        if (decision.stop) {
          progress = bankProgress(progress, tempProgress);
          tempProgress = {};
          turnCount += 1;
          rollCount = 0;
        }
      }

      renderDice(dice, roll, [], false);
      renderBoard(board, progress, tempProgress);
    };

    step();
    state.homeTimer = window.setInterval(step, 950);
  }

  function boot() {
    setupNavigation();
    populateHeuristicSelect();
    startSoloGame();
    startDuelGame();
    startTwoPlayerGame();
    startHomeDemo();

    document.querySelector("#solo-new-game").addEventListener("click", startSoloGame);
    document.querySelector("#duel-new-game").addEventListener("click", startDuelGame);
    document.querySelector("#two-player-new-game").addEventListener("click", startTwoPlayerGame);
    document.querySelector("#heuristic-select").addEventListener("change", startDuelGame);
  }

  globalThis.CantStopRules = {
    NS,
    COLUMNS,
    makeEmptyProgress,
    getPairings,
    getActionChoices,
    legalActionsForRoll,
    applyAction,
    bankProgress,
    countOpenColumns,
    listOpenColumns,
    countWonColumns,
    actionKey,
  };

  if (typeof document !== "undefined") {
    boot();
  }
})();

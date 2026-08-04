const { StateStore } = require('../reliability/stateStore');

const DEFAULTS = { metric: 'diamonds', target: 1000, label: 'Diamond Goal' };
const store = new StateStore('goal.json');

function getGoal() {
  return store.load(DEFAULTS);
}

function setGoal({ metric, target, label }) {
  if (metric !== 'diamonds' && metric !== 'likes') {
    throw new Error('metric must be "diamonds" or "likes"');
  }
  const numericTarget = Number(target);
  if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
    throw new Error('target must be a positive number');
  }
  const goal = { metric, target: numericTarget, label: label || DEFAULTS.label };
  store.save(goal);
  return goal;
}

module.exports = { getGoal, setGoal };

function calcScore(message = "") {
  const len = String(message).trim().length;

  if (len < 20) return 1;
  if (len < 50) return 2;
  return 3;
}

function getLevel(score = 0) {
  return Math.floor(Math.sqrt(score / 10));
}

function getNextLevelScore(level = 0) {
  const nextLevel = level + 1;
  return nextLevel * nextLevel * 10;
}

module.exports = {
  calcScore,
  getLevel,
  getNextLevelScore
};
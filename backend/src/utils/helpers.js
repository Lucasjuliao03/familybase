const { v4: uuidv4 } = require('uuid');

function generateId() {
  return uuidv4();
}

function paginate(query, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return { limit, offset };
}

function calculateLevel(xp) {
  // Each level requires more XP: level * 100
  let level = 1;
  let totalXpNeeded = 100;
  let accumulated = 0;
  
  while (accumulated + totalXpNeeded <= xp) {
    accumulated += totalXpNeeded;
    level++;
    totalXpNeeded = level * 100;
  }
  
  return {
    level,
    xp: xp - accumulated,
    xpNextLevel: totalXpNeeded
  };
}

module.exports = { generateId, paginate, calculateLevel };

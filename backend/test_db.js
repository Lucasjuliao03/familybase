const db = require('better-sqlite3')('./data/familybase.db'); 
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shopping_list'").get());

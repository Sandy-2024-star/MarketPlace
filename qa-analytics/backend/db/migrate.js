#!/usr/bin/env node
// Run schema migration manually: node db/migrate.js
'use strict';
const { getDb } = require('./client');
const db = getDb();
console.log('[migrate] Schema applied successfully.');
db.close();

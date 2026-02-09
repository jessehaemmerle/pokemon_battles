const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '.cache.json');
const memoryCache = new Map();

function loadFileCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.entries(data).forEach(([k, v]) => memoryCache.set(k, v));
  } catch (err) {
    // ignore
  }
}

function saveFileCache() {
  try {
    const obj = Object.fromEntries(memoryCache.entries());
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), 'utf-8');
  } catch (err) {
    // ignore
  }
}

function getCache(key) {
  return memoryCache.get(key);
}

function setCache(key, value) {
  memoryCache.set(key, value);
  saveFileCache();
}

loadFileCache();

module.exports = {
  getCache,
  setCache
};

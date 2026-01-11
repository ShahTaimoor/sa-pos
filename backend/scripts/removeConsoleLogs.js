/**
 * Remove/replace console.log, console.error, console.warn with logger
 * Run: node scripts/removeConsoleLogs.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const routesDir = path.join(__dirname, '../routes');
const servicesDir = path.join(__dirname, '../services');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const changes = [];

  // Check if logger is already imported
  const hasLoggerImport = /const logger = require\(['"]\.\.\/utils\/logger['"]\)/.test(content);
  
  // Check if file has console statements
  const hasConsole = /console\.(log|error|warn)\(/.test(content);
  
  if (!hasConsole) {
    return null; // No console statements to fix
  }

  // Add logger import if not present
  if (!hasLoggerImport) {
    // Find the last require statement before router/class definition
    const requirePattern = /(const .+ = require\(['"].+['"]\);)/g;
    const requires = [];
    let match;
    while ((match = requirePattern.exec(content)) !== null) {
      requires.push({ text: match[1], index: match.index });
    }
    
    if (requires.length > 0) {
      const lastRequire = requires[requires.length - 1];
      const insertIndex = lastRequire.index + lastRequire.text.length;
      content = content.slice(0, insertIndex) + 
                "\nconst logger = require('../utils/logger');" + 
                content.slice(insertIndex);
      modified = true;
      changes.push('Added logger import');
    }
  }

  // Replace console.log with logger.info (or remove if it's just debug info)
  content = content.replace(/console\.log\(([^)]+)\);?/g, (match, args) => {
    modified = true;
    changes.push('Replaced console.log');
    // Check if it's a debug statement (contains 'Request received', 'Query params', etc.)
    if (args.includes('Request received') || args.includes('Query params') || args.includes('params:')) {
      return `logger.debug(${args});`;
    }
    return `logger.info(${args});`;
  });

  // Replace console.error with logger.error
  content = content.replace(/console\.error\(([^)]+)\);?/g, (match, args) => {
    modified = true;
    changes.push('Replaced console.error');
    // If it's just error object, wrap it properly
    if (args.trim().startsWith('error') || args.trim().startsWith("'Error") || args.trim().startsWith('"Error')) {
      return `logger.error(${args});`;
    }
    // If it's error: error, convert to proper format
    if (args.includes('error:') && args.includes('error')) {
      const parts = args.split(',');
      const message = parts[0].trim();
      const errorObj = parts.slice(1).join(',').trim();
      return `logger.error(${message}, { error: ${errorObj} });`;
    }
    return `logger.error(${args});`;
  });

  // Replace console.warn with logger.warn
  content = content.replace(/console\.warn\(([^)]+)\);?/g, (match, args) => {
    modified = true;
    changes.push('Replaced console.warn');
    return `logger.warn(${args});`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { file: path.relative(__dirname, filePath), changes: [...new Set(changes)] };
  }
  
  return null;
}

console.log('🔍 Scanning for console statements...\n');

// Process routes
const routeFiles = glob.sync('**/*.js', { cwd: routesDir, absolute: true });
const routeResults = routeFiles.map(processFile).filter(Boolean);

// Process services
const serviceFiles = glob.sync('**/*.js', { cwd: servicesDir, absolute: true });
const serviceResults = serviceFiles.map(processFile).filter(Boolean);

// Summary
console.log('=== Summary ===');
console.log(`Routes processed: ${routeResults.length}`);
console.log(`Services processed: ${serviceResults.length}`);
console.log(`Total files modified: ${routeResults.length + serviceResults.length}\n`);

if (routeResults.length > 0 || serviceResults.length > 0) {
  console.log('=== Modified Files ===');
  [...routeResults, ...serviceResults].forEach(result => {
    console.log(`\n${result.file}`);
    result.changes.forEach(change => console.log(`  ✓ ${change}`));
  });
} else {
  console.log('✅ No files needed modification.');
}

console.log('\n✅ Done!');

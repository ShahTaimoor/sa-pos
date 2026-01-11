/**
 * Replace console.log/error/warn with logger in routes and services
 * This script helps identify and replace console statements
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const routesDir = path.join(__dirname, '../routes');
const servicesDir = path.join(__dirname, '../services');

// Patterns to replace
const replacements = [
  {
    pattern: /console\.log\(/g,
    replacement: 'logger.info(',
    description: 'console.log → logger.info'
  },
  {
    pattern: /console\.error\(/g,
    replacement: 'logger.error(',
    description: 'console.error → logger.error'
  },
  {
    pattern: /console\.warn\(/g,
    replacement: 'logger.warn(',
    description: 'console.warn → logger.warn'
  }
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];

  // Check if logger is already imported
  const hasLoggerImport = /const logger = require\(['"]\.\.\/utils\/logger['"]\)/.test(content);
  
  // Add logger import if not present and file has console statements
  const hasConsole = /console\.(log|error|warn)\(/.test(content);
  
  if (hasConsole && !hasLoggerImport) {
    // Find the last require statement
    const requireMatches = content.match(/const .+ = require\(['"].+['"]\);/g);
    if (requireMatches && requireMatches.length > 0) {
      const lastRequire = requireMatches[requireMatches.length - 1];
      const lastRequireIndex = content.lastIndexOf(lastRequire);
      const insertIndex = lastRequireIndex + lastRequire.length;
      content = content.slice(0, insertIndex) + 
                "\nconst logger = require('../utils/logger');" + 
                content.slice(insertIndex);
      modified = true;
      changes.push('Added logger import');
    }
  }

  // Replace console statements
  replacements.forEach(({ pattern, replacement, description }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
      changes.push(description);
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { file: filePath, changes };
  }
  
  return null;
}

// Process routes
console.log('Processing routes...');
const routeFiles = glob.sync('**/*.js', { cwd: routesDir, absolute: true });
const routeResults = routeFiles.map(processFile).filter(Boolean);

// Process services
console.log('Processing services...');
const serviceFiles = glob.sync('**/*.js', { cwd: servicesDir, absolute: true });
const serviceResults = serviceFiles.map(processFile).filter(Boolean);

// Summary
console.log('\n=== Summary ===');
console.log(`Routes processed: ${routeResults.length}`);
console.log(`Services processed: ${serviceResults.length}`);
console.log(`Total files modified: ${routeResults.length + serviceResults.length}`);

if (routeResults.length > 0 || serviceResults.length > 0) {
  console.log('\n=== Modified Files ===');
  [...routeResults, ...serviceResults].forEach(result => {
    console.log(`\n${result.file}`);
    result.changes.forEach(change => console.log(`  - ${change}`));
  });
} else {
  console.log('\nNo files needed modification.');
}

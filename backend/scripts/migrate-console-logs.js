/**
 * Console.log Migration Helper Script
 * 
 * This script helps identify console.log statements that need to be migrated to Winston logger.
 * Run with: node scripts/migrate-console-logs.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const excludeDirs = ['node_modules', 'logs', 'dist', 'build', '.git'];

// Find all JavaScript files
function findJSFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !excludeDirs.includes(file)) {
      findJSFiles(filePath, fileList);
    } else if (file.endsWith('.js') && !file.includes('node_modules')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Count console statements in a file
function countConsoleStatements(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const consoleLog = (content.match(/console\.log\(/g) || []).length;
  const consoleError = (content.match(/console\.error\(/g) || []).length;
  const consoleWarn = (content.match(/console\.warn\(/g) || []).length;
  const consoleInfo = (content.match(/console\.info\(/g) || []).length;
  const consoleDebug = (content.match(/console\.debug\(/g) || []).length;
  
  const total = consoleLog + consoleError + consoleWarn + consoleInfo + consoleDebug;
  
  return {
    file: path.relative(backendDir, filePath),
    consoleLog,
    consoleError,
    consoleWarn,
    consoleInfo,
    consoleDebug,
    total
  };
}

// Main execution
console.log('🔍 Scanning for console.log statements...\n');

const jsFiles = findJSFiles(backendDir);
const results = jsFiles
  .map(countConsoleStatements)
  .filter(result => result.total > 0)
  .sort((a, b) => b.total - a.total);

const totalConsoleLogs = results.reduce((sum, r) => sum + r.consoleLog, 0);
const totalConsoleErrors = results.reduce((sum, r) => sum + r.consoleError, 0);
const totalConsoleWarns = results.reduce((sum, r) => sum + r.consoleWarn, 0);
const totalConsoleInfos = results.reduce((sum, r) => sum + r.consoleInfo, 0);
const totalConsoleDebugs = results.reduce((sum, r) => sum + r.consoleDebug, 0);
const grandTotal = totalConsoleLogs + totalConsoleErrors + totalConsoleWarns + totalConsoleInfos + totalConsoleDebugs;

console.log('📊 Summary:');
console.log(`   Total files with console statements: ${results.length}`);
console.log(`   console.log(): ${totalConsoleLogs}`);
console.log(`   console.error(): ${totalConsoleErrors}`);
console.log(`   console.warn(): ${totalConsoleWarns}`);
console.log(`   console.info(): ${totalConsoleInfos}`);
console.log(`   console.debug(): ${totalConsoleDebugs}`);
console.log(`   Grand Total: ${grandTotal}\n`);

if (results.length > 0) {
  console.log('📁 Files with console statements (sorted by count):\n');
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.file}`);
    console.log(`   - console.log(): ${result.consoleLog}`);
    console.log(`   - console.error(): ${result.consoleError}`);
    console.log(`   - console.warn(): ${result.consoleWarn}`);
    console.log(`   - console.info(): ${result.consoleInfo}`);
    console.log(`   - console.debug(): ${result.consoleDebug}`);
    console.log(`   - Total: ${result.total}\n`);
  });
  
  console.log('\n💡 Migration Guide:');
  console.log('   1. Add logger import: const logger = require(\'../utils/logger\');');
  console.log('   2. Replace:');
  console.log('      - console.log() → logger.info()');
  console.log('      - console.error() → logger.error()');
  console.log('      - console.warn() → logger.warn()');
  console.log('      - console.info() → logger.info()');
  console.log('      - console.debug() → logger.debug()');
  console.log('   3. Add context to logs: logger.info(\'Message\', { key: value });');
} else {
  console.log('✅ No console statements found!');
}


/**
 * Service Update Helper Script
 * 
 * This script helps identify services that need tenantId updates.
 * It doesn't modify files automatically - it's a reference guide.
 * 
 * Run this to see which services need updating:
 *   node backend/scripts/updateServicesForTenantId.js
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');
const routesDir = path.join(__dirname, '../routes');

/**
 * Find repository calls without tenantId
 */
function findRepositoryCalls(filePath, content) {
  const issues = [];
  const lines = content.split('\n');
  
  // Patterns to look for
  const repositoryPatterns = [
    /\.findAll\(/,
    /\.findOne\(/,
    /\.findById\(/,
    /\.create\(/,
    /\.updateById\(/,
    /\.updateMany\(/,
    /\.softDelete\(/,
    /\.hardDelete\(/,
    /\.count\(/,
    /\.aggregate\(/
  ];
  
  lines.forEach((line, index) => {
    repositoryPatterns.forEach(pattern => {
      if (pattern.test(line)) {
        // Check if tenantId is in the options
        const nextLines = lines.slice(index, index + 5).join('\n');
        if (!nextLines.includes('tenantId') && !line.includes('tenantId')) {
          issues.push({
            line: index + 1,
            content: line.trim(),
            issue: 'Repository call without tenantId'
          });
        }
      }
    });
  });
  
  return issues;
}

/**
 * Find service method calls without tenantId parameter
 */
function findServiceCalls(filePath, content) {
  const issues = [];
  const lines = content.split('\n');
  
  // Common service method patterns
  const servicePatterns = [
    /customerService\./,
    /productService\./,
    /supplierService\./,
    /salesService\./,
    /inventoryService\./,
    /accountingService\./,
    /journalEntryService\./
  ];
  
  lines.forEach((line, index) => {
    servicePatterns.forEach(pattern => {
      if (pattern.test(line)) {
        // Check if tenantId is passed
        if (!line.includes('tenantId') && !line.includes('req.tenantId')) {
          issues.push({
            line: index + 1,
            content: line.trim(),
            issue: 'Service call without tenantId'
          });
        }
      }
    });
  });
  
  return issues;
}

/**
 * Scan a file for issues
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(__dirname, filePath);
  
  const repositoryIssues = findRepositoryCalls(filePath, content);
  const serviceIssues = findServiceCalls(filePath, content);
  
  return {
    file: relativePath,
    repositoryIssues,
    serviceIssues,
    totalIssues: repositoryIssues.length + serviceIssues.length
  };
}

/**
 * Main scan function
 */
function scanDirectory(dir, fileExtension = '.js') {
  const results = [];
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      results.push(...scanDirectory(filePath, fileExtension));
    } else if (file.endsWith(fileExtension)) {
      const result = scanFile(filePath);
      if (result.totalIssues > 0) {
        results.push(result);
      }
    }
  });
  
  return results;
}

// Run scan
console.log('🔍 Scanning services and routes for tenantId issues...\n');

const serviceResults = scanDirectory(servicesDir);
const routeResults = scanDirectory(routesDir);

console.log(`📊 Found ${serviceResults.length} services with potential issues`);
console.log(`📊 Found ${routeResults.length} routes with potential issues\n`);

if (serviceResults.length > 0) {
  console.log('📁 Services needing updates:');
  serviceResults.forEach(result => {
    console.log(`\n  ${result.file}`);
    if (result.repositoryIssues.length > 0) {
      console.log(`    Repository issues: ${result.repositoryIssues.length}`);
      result.repositoryIssues.slice(0, 3).forEach(issue => {
        console.log(`      Line ${issue.line}: ${issue.content.substring(0, 60)}...`);
      });
    }
    if (result.serviceIssues.length > 0) {
      console.log(`    Service call issues: ${result.serviceIssues.length}`);
      result.serviceIssues.slice(0, 3).forEach(issue => {
        console.log(`      Line ${issue.line}: ${issue.content.substring(0, 60)}...`);
      });
    }
  });
}

if (routeResults.length > 0) {
  console.log('\n📁 Routes needing updates:');
  routeResults.forEach(result => {
    console.log(`\n  ${result.file}`);
    if (result.serviceIssues.length > 0) {
      console.log(`    Service call issues: ${result.serviceIssues.length}`);
      result.serviceIssues.slice(0, 3).forEach(issue => {
        console.log(`      Line ${issue.line}: ${issue.content.substring(0, 60)}...`);
      });
    }
  });
}

console.log('\n✅ Scan complete!');
console.log('\n💡 Note: This is a heuristic scan. Manual review is recommended.');

const fs = require('fs');

class LogFormatValidator {
  constructor() {
    this.requiredFields = ['timestamp', 'eventid'];
    this.commonFields = ['src_ip', 'session', 'dst_ip', 'dst_port', 'protocol'];
    this.eventTypes = [
      'cowrie.login.success',
      'cowrie.login.failed', 
      'cowrie.session.connect',
      'cowrie.session.closed',
      'cowrie.command.input',
      'cowrie.session.file_download',
      'cowrie.session.file_upload'
    ];
  }

  validateLogFormat(logContent, sampleSize = 10) {
    const lines = logContent.split('\n').filter(line => line.trim());
    const results = {
      totalLines: lines.length,
      validLines: 0,
      invalidLines: 0,
      errors: [],
      warnings: [],
      sample: [],
      eventTypes: {},
      fieldCoverage: {}
    };

    // Check a sample of lines
    const samplesToCheck = Math.min(sampleSize, lines.length);
    
    for (let i = 0; i < samplesToCheck; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      try {
        const entry = JSON.parse(line);
        results.validLines++;
        
        // Check required fields
        const missingFields = this.requiredFields.filter(field => !entry[field]);
        if (missingFields.length > 0) {
          results.warnings.push(`Line ${lineNumber}: Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Count event types
        if (entry.eventid) {
          results.eventTypes[entry.eventid] = (results.eventTypes[entry.eventid] || 0) + 1;
        }
        
        // Check field coverage
        [...this.requiredFields, ...this.commonFields].forEach(field => {
          if (entry[field]) {
            results.fieldCoverage[field] = (results.fieldCoverage[field] || 0) + 1;
          }
        });
        
        // Add to sample
        if (results.sample.length < 3) {
          results.sample.push(entry);
        }
        
      } catch (error) {
        results.invalidLines++;
        results.errors.push(`Line ${lineNumber}: Invalid JSON - ${error.message}`);
      }
    }
    
    // Calculate field coverage percentages
    Object.keys(results.fieldCoverage).forEach(field => {
      results.fieldCoverage[field] = {
        count: results.fieldCoverage[field],
        percentage: ((results.fieldCoverage[field] / samplesToCheck) * 100).toFixed(1)
      };
    });
    
    return results;
  }

  generateReport(results) {
    console.log('\n🔍 Cowrie Log Format Validation Report');
    console.log('======================================');
    
    console.log(`\n📊 Summary:`);
    console.log(`Total lines analyzed: ${results.totalLines}`);
    console.log(`Valid JSON lines: ${results.validLines}`);
    console.log(`Invalid lines: ${results.invalidLines}`);
    
    if (results.invalidLines > 0) {
      console.log(`\n❌ Errors (${results.errors.length}):`);
      results.errors.slice(0, 5).forEach(error => console.log(`  ${error}`));
      if (results.errors.length > 5) {
        console.log(`  ... and ${results.errors.length - 5} more errors`);
      }
    }
    
    if (results.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${results.warnings.length}):`);
      results.warnings.slice(0, 5).forEach(warning => console.log(`  ${warning}`));
      if (results.warnings.length > 5) {
        console.log(`  ... and ${results.warnings.length - 5} more warnings`);
      }
    }
    
    console.log(`\n📋 Event Types Found:`);
    Object.entries(results.eventTypes)
      .sort(([,a], [,b]) => b - a)
      .forEach(([eventType, count]) => {
        const known = this.eventTypes.includes(eventType) ? '✅' : '❓';
        console.log(`  ${known} ${eventType}: ${count}`);
      });
    
    console.log(`\n📊 Field Coverage:`);
    this.requiredFields.forEach(field => {
      const coverage = results.fieldCoverage[field];
      if (coverage) {
        console.log(`  ✅ ${field}: ${coverage.percentage}% (${coverage.count} lines)`);
      } else {
        console.log(`  ❌ ${field}: 0% (missing)`);
      }
    });
    
    this.commonFields.forEach(field => {
      const coverage = results.fieldCoverage[field];
      if (coverage) {
        console.log(`  📝 ${field}: ${coverage.percentage}% (${coverage.count} lines)`);
      }
    });
    
    if (results.sample.length > 0) {
      console.log(`\n📄 Sample Log Entry:`);
      console.log(JSON.stringify(results.sample[0], null, 2));
    }
    
    // Recommendations
    console.log(`\n💡 Recommendations:`);
    if (results.invalidLines > 0) {
      console.log(`  🔧 Fix ${results.invalidLines} invalid JSON lines`);
    }
    if (!results.fieldCoverage.timestamp || results.fieldCoverage.timestamp.percentage < 100) {
      console.log(`  🕐 Ensure all entries have timestamp field`);
    }
    if (!results.fieldCoverage.eventid || results.fieldCoverage.eventid.percentage < 100) {
      console.log(`  🎯 Ensure all entries have eventid field`);
    }
    if (Object.keys(results.eventTypes).length === 0) {
      console.log(`  📊 No event types found - check log format`);
    }
  }
}

module.exports = LogFormatValidator;

const express = require('express');
const router = express.Router();
const AzureBlobService = require('../services/azureBlobService');
const LogAnalysisService = require('../services/logAnalysisService');
const LogFormatValidator = require('../utils/logFormatValidator');

const blobService = new AzureBlobService();
const analysisService = new LogAnalysisService();
const logValidator = new LogFormatValidator();

// Test Azure Storage connection
router.get('/test-connection', async (req, res) => {
  try {
    const result = await blobService.testConnection();
    res.json({
      success: true,
      connection: result
    });
  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

// Validate log format
router.get('/validate-logs', async (req, res) => {
  try {
    const sampleSize = parseInt(req.query.sampleSize) || 10;
    
    // Use streaming analytics with very conservative limits for validation
    const streamingResult = await blobService.getStreamingAnalytics(1, 2); // Last hour, max 2 files
    
    if (streamingResult.totalLines === 0) {
      return res.json({
        success: false,
        message: 'No logs found to validate'
      });
    }
    
    const results = logValidator.validateLogFormat(streamingResult.sampleData, sampleSize);
    
    res.json({
      success: true,
      validation: results,
      filesProcessed: streamingResult.processedFiles,
      totalLines: streamingResult.totalLines,
      recommendations: {
        formatOk: results.invalidLines === 0,
        hasRequiredFields: results.fieldCoverage.timestamp && results.fieldCoverage.eventid,
        hasEventTypes: Object.keys(results.eventTypes).length > 0
      }
    });
  } catch (error) {
    console.error('Log validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate logs',
      message: error.message
    });
  }
});

// Get logs endpoint for the frontend
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 100); // Cap at 100 to prevent memory issues
    const timeRange = req.query.timeRange || '24h';
    
    let hours = 24 * 7; // Default to 7 days to find older logs
    let maxFiles = 3; // Limit files for log endpoint
    switch (timeRange) {
      case '1h': hours = 1; maxFiles = 1; break;
      case '24h': hours = 24; maxFiles = 3; break;
      case '7d': hours = 24 * 7; maxFiles = 5; break;
      case '30d': hours = 24 * 30; maxFiles = 8; break;
      case 'all': hours = 24 * 365; maxFiles = 10; break;
    }
    
    console.log(`📄 Logs request: ${timeRange} (${hours}h, max ${maxFiles} files, limit ${limit})`);
    const logContent = await blobService.getRecentLogs(hours, maxFiles);
    
    if (!logContent) {
      console.log('⚠️ No log content found for logs endpoint');
      return res.json([]);
    }
    
    // Parse the logs and return them
    const logs = logContent.split('\n')
      .filter(line => line.trim())
      .slice(0, limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(log => log !== null);
    
    console.log(`📋 Returning ${logs.length} log entries from ${logContent.processedFiles} files`);
    
    res.json(logs);
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({
      error: 'Failed to fetch logs',
      message: error.message
    });
  }
});

// Get analytics endpoint for the frontend
router.get('/analytics', async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '1h';
    
    let hours = 24 * 7; // Default to 7 days to catch older logs
    let maxFiles = 3; // Very conservative for large datasets
    switch (timeRange) {
      case '1h': 
        hours = 1; 
        maxFiles = 2; 
        break;
      case '24h': 
        hours = 24; 
        maxFiles = 5; 
        break;
      case '7d': 
        hours = 24 * 7; 
        maxFiles = 10; 
        break;
      case '30d': 
        hours = 24 * 30; 
        maxFiles = 15; 
        break;
      case 'all':
        hours = 24 * 365; // 1 year to catch very old logs
        maxFiles = 20;
        break;
    }
    
    console.log(`📊 Analytics request: ${timeRange} (${hours}h, max ${maxFiles} files)`);
    
    // Use streaming analytics to avoid memory overload
    const streamingResult = await blobService.getStreamingAnalytics(hours, maxFiles);
    
    if (streamingResult.totalLines === 0) {
      return res.json({
        totalSessions: 0,
        uniqueIPs: 0,
        totalEvents: 0,
        topSourceIPs: [],
        topUsernames: [],
        topPasswords: [],
        topCommands: [],
        sessionsOverTime: [],
        loginAttempts: { totalAttempts: 0, successfulLogins: 0, failedLogins: 0 },
        commands: { totalCommands: 0, uniqueCommands: 0 },
        timeRange,
        filesProcessed: 0,
        message: `No data found for ${timeRange}`
      });
    }
    
    // Process the sample data for analytics
    const analytics = analysisService.analyzeLogs(streamingResult.sampleData);
    
    res.json({
      ...analytics,
      timeRange,
      filesProcessed: streamingResult.processedFiles,
      totalLines: streamingResult.totalLines,
      dataSource: 'streaming_sample',
      filesAnalyzed: streamingResult.filesAnalyzed
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to generate analytics',
      message: error.message
    });
  }
});

// Get dashboard overview with analytics
router.get('/dashboard', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const logContent = await blobService.getRecentLogs(hours);
    
    if (!logContent) {
      return res.json({
        message: 'No logs found for the specified time period',
        timeRange: hours,
        analytics: null
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: hours,
      analytics
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate dashboard analytics',
      message: error.message
    });
  }
});

// Get detailed login analysis
router.get('/login-analysis', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const logContent = await blobService.getRecentLogs(hours);
    
    if (!logContent) {
      return res.json({
        message: 'No logs found for the specified time period',
        loginAnalysis: null
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: hours,
      loginAnalysis: analytics.loginAttempts,
      topSourceIPs: analytics.topSourceIPs,
      geographicDistribution: analytics.geographicDistribution
    });
  } catch (error) {
    console.error('Login analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze login attempts',
      message: error.message
    });
  }
});

// Get command analysis
router.get('/commands', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const logContent = await blobService.getRecentLogs(hours);
    
    if (!logContent) {
      return res.json({
        message: 'No logs found for the specified time period',
        commands: null
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: hours,
      commands: analytics.commands,
      attackPatterns: analytics.attackPatterns
    });
  } catch (error) {
    console.error('Command analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze commands',
      message: error.message
    });
  }
});

// Get geographic analysis
router.get('/geography', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const logContent = await blobService.getRecentLogs(hours);
    
    if (!logContent) {
      return res.json({
        message: 'No logs found for the specified time period',
        geography: null
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: hours,
      geographicDistribution: analytics.geographicDistribution,
      topSourceIPs: analytics.topSourceIPs
    });
  } catch (error) {
    console.error('Geographic analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze geographic data',
      message: error.message
    });
  }
});

// Get attack patterns
router.get('/attack-patterns', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const logContent = await blobService.getRecentLogs(hours);
    
    if (!logContent) {
      return res.json({
        message: 'No logs found for the specified time period',
        attackPatterns: null
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: hours,
      attackPatterns: analytics.attackPatterns
    });
  } catch (error) {
    console.error('Attack patterns analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze attack patterns',
      message: error.message
    });
  }
});

// Get sessions over time
router.get('/sessions-timeline', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const intervalHours = parseInt(req.query.interval) || 1;
    const logContent = await blobService.getRecentLogs(hours);
    
    if (!logContent) {
      return res.json({
        message: 'No logs found for the specified time period',
        timeline: []
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: hours,
      interval: intervalHours,
      timeline: analytics.sessionsOverTime
    });
  } catch (error) {
    console.error('Sessions timeline error:', error);
    res.status(500).json({
      error: 'Failed to generate sessions timeline',
      message: error.message
    });
  }
});

// List available log files
router.get('/log-files', async (req, res) => {
  try {
    const maxResults = parseInt(req.query.limit) || 50;
    const files = await blobService.listLogFiles('', maxResults);
    
    res.json({
      success: true,
      files: files.map(file => ({
        name: file.name,
        lastModified: file.lastModified,
        size: file.size,
        sizeFormatted: formatBytes(file.size)
      }))
    });
  } catch (error) {
    console.error('List log files error:', error);
    res.status(500).json({
      error: 'Failed to list log files',
      message: error.message
    });
  }
});

// Get real-time statistics
router.get('/realtime', async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes) || 60;
    const hours = minutes / 60;
    const logContent = await blobService.getRecentLogs(hours, 10); // Limit files for real-time
    
    if (!logContent) {
      return res.json({
        message: 'No recent logs found',
        realtime: {
          totalEvents: 0,
          activeIPs: 0,
          loginAttempts: 0,
          commands: 0
        }
      });
    }
    
    const analytics = analysisService.analyzeLogs(logContent);
    
    res.json({
      success: true,
      timeRange: minutes,
      realtime: {
        totalEvents: analytics.totalEvents,
        activeIPs: analytics.topSourceIPs.length,
        loginAttempts: analytics.loginAttempts.totalAttempts,
        commands: analytics.commands.totalCommands,
        lastUpdate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Real-time stats error:', error);
    res.status(500).json({
      error: 'Failed to get real-time statistics',
      message: error.message
    });
  }
});

// Debug endpoint to test downloading a specific file
router.get('/debug-download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    console.log(`🔍 Debug: Attempting to download ${filename}`);
    
    const content = await blobService.downloadLogFile(filename);
    console.log(`✅ Debug: Successfully downloaded ${filename}, content length: ${content.length}`);
    
    // Parse first few lines to show structure
    const lines = content.split('\n').slice(0, 5);
    
    res.json({
      success: true,
      filename,
      contentLength: content.length,
      sampleLines: lines,
      firstLineExample: lines[0] ? lines[0] : null
    });
  } catch (error) {
    console.error('❌ Debug download error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = router;

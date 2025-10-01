const express = require('express');
const router = express.Router();
const AzureBlobService = require('../services/azureBlobService');
const LogAnalysisService = require('../services/logAnalysisService');

const blobService = new AzureBlobService();
const analysisService = new LogAnalysisService();

// Get recent logs (used by frontend)
router.get('/logs', async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '24h';
    const limit = parseInt(req.query.limit) || 100;

    let hours = 24;
    let maxFiles = 3;
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
      console.log('⚠️ No log content found');
      return res.json([]);
    }

    // Parse logs and return them
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

    console.log(`📋 Returning ${logs.length} log entries from ${maxFiles} files`);
    res.json(logs);
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({
      error: 'Failed to fetch logs',
      message: error.message
    });
  }
});

// Get analytics data (used by frontend)
router.get('/analytics', async (req, res) => {
  const timeRange = req.query.timeRange || '24h';

  try {
    let hours = 24;
    let maxFiles = 5;
    switch (timeRange) {
      case '1h': hours = 1; maxFiles = 3; break;
      case '24h': hours = 24; maxFiles = 5; break;
      case '7d': hours = 24 * 7; maxFiles = 10; break;
      case '30d': hours = 24 * 30; maxFiles = 15; break;
      case 'all': hours = 24 * 365; maxFiles = 20; break;
    }

    console.log(`📊 Analytics request: ${timeRange} (${hours}h, max ${maxFiles} files)`);

    // Get log content
    const logContent = await blobService.getRecentLogs(hours, maxFiles);

    if (!logContent) {
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
        totalLines: 0,
        dataSource: 'no_data'
      });
    }

    // Analyze the logs
    const analytics = analysisService.analyzeLogs(logContent);
    const lines = logContent.split('\n').filter(line => line.trim().length > 0);

    res.json({
      ...analytics,
      timeRange,
      filesProcessed: maxFiles,
      totalLines: lines.length,
      dataSource: 'azure_storage'
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.json({
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
      totalLines: 0,
      error: true,
      errorMessage: error.message,
      dataSource: 'error'
    });
  }
});

// Test connection endpoint (for debugging)
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

module.exports = router;

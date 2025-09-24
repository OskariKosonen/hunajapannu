const moment = require('moment');
const geoip = require('geoip-lite');

class LogAnalysisService {
  constructor() {
    this.eventTypes = {
      'cowrie.login.success': 'Successful Login',
      'cowrie.login.failed': 'Failed Login',
      'cowrie.session.connect': 'Session Connected',
      'cowrie.session.closed': 'Session Closed',
      'cowrie.command.input': 'Command Executed',
      'cowrie.session.file_download': 'File Downloaded',
      'cowrie.session.file_upload': 'File Uploaded'
    };
  }

  parseLogEntry(logLine) {
    try {
      return JSON.parse(logLine);
    } catch (error) {
      return null;
    }
  }

  analyzeLogs(logContent) {
    const lines = logContent.split('\n').filter(line => line.trim());
    const events = [];
    
    for (const line of lines) {
      const event = this.parseLogEntry(line);
      if (event && event.timestamp) {
        events.push(event);
      }
    }

    return {
      totalEvents: events.length,
      timeRange: this.getTimeRange(events),
      eventsByType: this.groupEventsByType(events),
      topSourceIPs: this.getTopSourceIPs(events),
      geographicDistribution: this.getGeographicDistribution(events),
      loginAttempts: this.analyzeLoginAttempts(events),
      commands: this.analyzeCommands(events),
      sessionsOverTime: this.getSessionsOverTime(events),
      attackPatterns: this.analyzeAttackPatterns(events)
    };
  }

  getTimeRange(events) {
    if (events.length === 0) return null;
    
    const timestamps = events.map(e => new Date(e.timestamp)).sort();
    return {
      start: timestamps[0],
      end: timestamps[timestamps.length - 1],
      duration: timestamps[timestamps.length - 1] - timestamps[0]
    };
  }

  groupEventsByType(events) {
    const grouped = {};
    
    for (const event of events) {
      const eventType = event.eventid || 'unknown';
      const displayName = this.eventTypes[eventType] || eventType;
      
      if (!grouped[displayName]) {
        grouped[displayName] = 0;
      }
      grouped[displayName]++;
    }
    
    return Object.entries(grouped)
      .sort(([,a], [,b]) => b - a)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
  }

  getTopSourceIPs(events, limit = 20) {
    const ipCounts = {};
    
    for (const event of events) {
      const ip = event.src_ip;
      if (ip) {
        if (!ipCounts[ip]) {
          ipCounts[ip] = { count: 0, firstSeen: event.timestamp, lastSeen: event.timestamp };
        }
        ipCounts[ip].count++;
        ipCounts[ip].lastSeen = event.timestamp;
      }
    }
    
    return Object.entries(ipCounts)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, limit)
      .map(([ip, data]) => ({
        ip,
        count: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        location: geoip.lookup(ip)
      }));
  }

  getGeographicDistribution(events) {
    const countries = {};
    
    for (const event of events) {
      const ip = event.src_ip;
      if (ip) {
        const geo = geoip.lookup(ip);
        if (geo && geo.country) {
          const country = geo.country;
          if (!countries[country]) {
            countries[country] = { count: 0, ips: new Set() };
          }
          countries[country].count++;
          countries[country].ips.add(ip);
        }
      }
    }
    
    return Object.entries(countries)
      .map(([country, data]) => ({
        country,
        count: data.count,
        uniqueIPs: data.ips.size
      }))
      .sort((a, b) => b.count - a.count);
  }

  analyzeLoginAttempts(events) {
    const loginEvents = events.filter(e => 
      e.eventid === 'cowrie.login.success' || e.eventid === 'cowrie.login.failed'
    );
    
    const credentials = {};
    const successfulLogins = loginEvents.filter(e => e.eventid === 'cowrie.login.success');
    const failedLogins = loginEvents.filter(e => e.eventid === 'cowrie.login.failed');
    
    for (const event of loginEvents) {
      const cred = `${event.username || 'unknown'}:${event.password || 'unknown'}`;
      if (!credentials[cred]) {
        credentials[cred] = { attempts: 0, successful: 0, ips: new Set() };
      }
      credentials[cred].attempts++;
      if (event.eventid === 'cowrie.login.success') {
        credentials[cred].successful++;
      }
      if (event.src_ip) {
        credentials[cred].ips.add(event.src_ip);
      }
    }
    
    const topCredentials = Object.entries(credentials)
      .sort(([,a], [,b]) => b.attempts - a.attempts)
      .slice(0, 20)
      .map(([cred, data]) => ({
        credential: cred,
        attempts: data.attempts,
        successful: data.successful,
        uniqueIPs: data.ips.size
      }));
    
    return {
      totalAttempts: loginEvents.length,
      successfulLogins: successfulLogins.length,
      failedLogins: failedLogins.length,
      successRate: loginEvents.length > 0 ? (successfulLogins.length / loginEvents.length * 100).toFixed(2) : 0,
      topCredentials
    };
  }

  analyzeCommands(events) {
    const commandEvents = events.filter(e => e.eventid === 'cowrie.command.input');
    const commands = {};
    
    for (const event of commandEvents) {
      const input = event.input;
      if (input) {
        const command = input.split(' ')[0]; // First word is the command
        if (!commands[command]) {
          commands[command] = 0;
        }
        commands[command]++;
      }
    }
    
    const topCommands = Object.entries(commands)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([command, count]) => ({ command, count }));
    
    return {
      totalCommands: commandEvents.length,
      uniqueCommands: Object.keys(commands).length,
      topCommands
    };
  }

  getSessionsOverTime(events, intervalHours = 1) {
    const sessionEvents = events.filter(e => 
      e.eventid === 'cowrie.session.connect' || e.eventid === 'cowrie.session.closed'
    );
    
    if (sessionEvents.length === 0) return [];
    
    const timeRange = this.getTimeRange(sessionEvents);
    if (!timeRange) return [];
    
    const intervals = {};
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    for (const event of sessionEvents) {
      const timestamp = new Date(event.timestamp);
      const intervalStart = new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
      const key = intervalStart.toISOString();
      
      if (!intervals[key]) {
        intervals[key] = { connects: 0, disconnects: 0 };
      }
      
      if (event.eventid === 'cowrie.session.connect') {
        intervals[key].connects++;
      } else {
        intervals[key].disconnects++;
      }
    }
    
    return Object.entries(intervals)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .map(([timestamp, data]) => ({
        timestamp,
        connects: data.connects,
        disconnects: data.disconnects
      }));
  }

  analyzeAttackPatterns(events) {
    const patterns = {
      bruteForce: this.detectBruteForceAttacks(events),
      malwareDownloads: this.detectMalwareDownloads(events),
      privilegeEscalation: this.detectPrivilegeEscalation(events),
      reconCommands: this.detectReconCommands(events)
    };
    
    return patterns;
  }

  detectBruteForceAttacks(events) {
    const loginEvents = events.filter(e => 
      e.eventid === 'cowrie.login.failed' || e.eventid === 'cowrie.login.success'
    );
    
    const ipAttempts = {};
    
    for (const event of loginEvents) {
      const ip = event.src_ip;
      if (ip) {
        if (!ipAttempts[ip]) {
          ipAttempts[ip] = [];
        }
        ipAttempts[ip].push({
          timestamp: new Date(event.timestamp),
          success: event.eventid === 'cowrie.login.success',
          username: event.username,
          password: event.password
        });
      }
    }
    
    const bruteForceIPs = [];
    const threshold = 10; // 10+ failed attempts in 1 hour
    const timeWindow = 60 * 60 * 1000; // 1 hour
    
    for (const [ip, attempts] of Object.entries(ipAttempts)) {
      attempts.sort((a, b) => a.timestamp - b.timestamp);
      
      for (let i = 0; i < attempts.length; i++) {
        const windowStart = attempts[i].timestamp;
        const windowEnd = new Date(windowStart.getTime() + timeWindow);
        
        const windowAttempts = attempts.filter(a => 
          a.timestamp >= windowStart && a.timestamp <= windowEnd && !a.success
        );
        
        if (windowAttempts.length >= threshold) {
          bruteForceIPs.push({
            ip,
            failedAttempts: windowAttempts.length,
            timeWindow: { start: windowStart, end: windowEnd },
            location: geoip.lookup(ip)
          });
          break; // Found brute force for this IP
        }
      }
    }
    
    return bruteForceIPs;
  }

  detectMalwareDownloads(events) {
    return events.filter(e => 
      e.eventid === 'cowrie.session.file_download' && 
      e.url && 
      (e.url.includes('.exe') || e.url.includes('.sh') || e.url.includes('.py'))
    ).map(e => ({
      ip: e.src_ip,
      url: e.url,
      timestamp: e.timestamp,
      location: geoip.lookup(e.src_ip)
    }));
  }

  detectPrivilegeEscalation(events) {
    const escalationCommands = ['sudo', 'su', 'chmod +s', 'passwd'];
    return events.filter(e => 
      e.eventid === 'cowrie.command.input' && 
      e.input && 
      escalationCommands.some(cmd => e.input.toLowerCase().includes(cmd))
    ).map(e => ({
      ip: e.src_ip,
      command: e.input,
      timestamp: e.timestamp,
      location: geoip.lookup(e.src_ip)
    }));
  }

  detectReconCommands(events) {
    const reconCommands = ['whoami', 'uname', 'ps', 'netstat', 'ifconfig', 'ls /etc'];
    return events.filter(e => 
      e.eventid === 'cowrie.command.input' && 
      e.input && 
      reconCommands.some(cmd => e.input.toLowerCase().includes(cmd))
    ).map(e => ({
      ip: e.src_ip,
      command: e.input,
      timestamp: e.timestamp,
      location: geoip.lookup(e.src_ip)
    }));
  }
}

module.exports = LogAnalysisService;

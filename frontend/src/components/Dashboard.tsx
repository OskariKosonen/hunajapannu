import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface LogEntry {
  timestamp: string;
  session: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  username?: string;
  password?: string;
  input?: string;
  message: string;
  eventid: string;
  protocol: string;
  location?: {
    country: string;
    region: string;
    city: string;
    range?: number[];
    eu?: string;
    timezone?: string;
    ll?: number[];
    metro?: number;
    area?: number;
  };
}

interface LocationInfo {
  country: string;
  region?: string;
  city?: string;
  range?: number[];
  eu?: string;
  timezone?: string;
  ll?: number[];
  metro?: number;
  area?: number;
}

interface Analytics {
  totalEvents: number;
  topSourceIPs?: Array<{
    ip: string;
    count: number;
    location?: LocationInfo;
    firstSeen?: string;
    lastSeen?: string;
  }>;
  geographicDistribution?: Array<{
    country: string;
    count: number;
    uniqueIPs?: number;
  }>;
  loginAttempts?: {
    totalAttempts: number;
    failedLogins: number;
    successfulLogins?: number;
    successRate?: string;
    topCredentials?: Array<{
      credential: string;
      attempts: number;
      successful: number;
      uniqueIPs: number;
    }>;
  };
  attackPatterns?: {
    bruteForce?: Array<{ ip: string; failedAttempts: number }>;
  };
  commands?: {
    totalCommands: number;
    uniqueCommands: number;
    topCommands?: Array<{
      command: string;
      count: number;
    }>;
  };
  filesProcessed: number;
  totalLines: number;
}

// Use environment variable for API URL, fallback to localhost for development
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const Dashboard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24h');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch recent logs
        const logsResponse = await axios.get(`${API_BASE_URL}/logs?limit=100&timeRange=${timeRange}`);
        setLogs(logsResponse.data);

        // Fetch analytics
        const analyticsResponse = await axios.get(`${API_BASE_URL}/analytics?timeRange=${timeRange}`);
        setAnalytics(analyticsResponse.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch data');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const retryFetch = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch recent logs
      const logsResponse = await axios.get(`${API_BASE_URL}/logs?limit=100&timeRange=${timeRange}`);
      setLogs(logsResponse.data);

      // Fetch analytics
      const analyticsResponse = await axios.get(`${API_BASE_URL}/analytics?timeRange=${timeRange}`);
      setAnalytics(analyticsResponse.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto"></div>
          <p className="mt-4 text-green-400 font-mono">$ Loading honeypot data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900 border border-red-500 text-red-400 px-4 py-3 rounded font-mono">
            <strong className="font-bold">ERROR: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
          <button
            onClick={retryFetch}
            className="mt-4 bg-green-600 hover:bg-green-500 text-black font-bold py-2 px-4 rounded font-mono border border-green-400"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-400 p-6 font-mono">
      <div className="max-w-7xl mx-auto">
        {/* Terminal Header */}
        <div className="mb-6 border border-green-400 rounded-lg bg-gray-900">
          <div className="flex items-center px-4 py-2 bg-gray-800 rounded-t-lg border-b border-green-400">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="ml-4 text-green-400 text-sm">hunajapannu-terminal</div>
          </div>
          <div className="p-4">
            <h1 className="text-2xl font-bold text-green-400 mb-2">
              <span className="text-green-500">$</span> ./hunajapannu-dashboard.sh
            </h1>
            <div className="text-green-400 space-y-1">
              <div><span className="text-green-500">[INFO]</span> Honeypot monitoring system active 🍯</div>
            </div>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="mb-6 bg-gray-900 border border-green-400 rounded-lg p-4">
          <label htmlFor="timeRange" className="block text-sm font-medium text-green-400 mb-2">
            <span className="text-green-500">$</span> SELECT TIME_RANGE:
          </label>
          <select
            id="timeRange"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-black border border-green-400 rounded text-green-400 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="1h">LAST_HOUR</option>
            <option value="24h">LAST_24H</option>
            <option value="7d">LAST_7D</option>
            <option value="30d">LAST_30D</option>
            <option value="all">ALL_TIME</option>
          </select>
        </div>

        {/* Analytics Cards */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gray-900 border border-green-400 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-green-400 mb-2">[EVENTS]</h3>
              <p className="text-3xl font-bold text-green-500">{analytics.totalEvents}</p>
              <p className="text-sm text-green-600 mt-1">from {analytics.filesProcessed} files</p>
            </div>

            <div className="bg-gray-900 border border-red-400 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-red-400 mb-2">[LOGIN_ATTEMPTS]</h3>
              <p className="text-3xl font-bold text-red-500">{analytics.loginAttempts?.totalAttempts || 0}</p>
              <p className="text-sm text-red-600 mt-1">{analytics.loginAttempts?.failedLogins || 0} failed</p>
            </div>

            <div className="bg-gray-900 border border-yellow-400 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">[TOP_ATTACKERS]</h3>
              <div className="space-y-1">
                {analytics.topSourceIPs?.slice(0, 3).map((item, index) => (
                  <div key={index} className="text-sm">
                    <span className="text-yellow-300">{item.ip}</span>
                    <span className="float-right text-yellow-500">{item.count}</span>
                    <div className="text-xs text-yellow-600">
                      {item.location ? `${item.location.city || 'UNKNOWN'}, ${item.location.country || 'UNKNOWN'}` : 'UNKNOWN'}
                    </div>
                  </div>
                )) || (
                    <div className="text-sm text-yellow-600">No attackers detected</div>
                  )}
              </div>
            </div>

            <div className="bg-gray-900 border border-cyan-400 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-cyan-400 mb-2">[BRUTE_FORCE]</h3>
              <div className="space-y-1">
                {analytics.attackPatterns?.bruteForce?.slice(0, 3).map((item, index) => (
                  <div key={index} className="text-sm">
                    <span className="text-cyan-300">{item.ip}</span>
                    <span className="float-right text-cyan-500">{item.failedAttempts}</span>
                  </div>
                )) || (
                    <div className="text-sm text-cyan-600">No brute force attacks detected</div>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Geographic Distribution */}
        {analytics && analytics.geographicDistribution && (
          <div className="bg-gray-900 border border-green-400 rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-green-400">
              <h2 className="text-xl font-semibold text-green-400">
                <span className="text-green-500">$</span> ATTACK_SOURCES_BY_COUNTRY
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {analytics.geographicDistribution.map((country, index) => (
                  <div key={index} className="bg-black border border-green-400 rounded-lg p-4">
                    <div className="text-lg font-bold text-green-400">{country.country}</div>
                    <div className="text-2xl font-bold text-red-400">{country.count}</div>
                    <div className="text-sm text-green-600">ATTACKS</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Most Used Credentials */}
        {analytics && analytics.loginAttempts?.topCredentials && (
          <div className="bg-gray-900 border border-red-400 rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-red-400">
              <h2 className="text-xl font-semibold text-red-400">
                <span className="text-red-500">$</span> grep -i "password\|user" /var/log/honeypot.log | sort | uniq -c
              </h2>
              <p className="text-sm text-red-600 mt-1">Most attempted username:password combinations</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.loginAttempts.topCredentials?.slice(0, 12).map((cred, index) => {
                  const [username, password] = (cred.credential || '').split(':');
                  return (
                    <div key={index} className="bg-black border border-red-400 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold text-red-400">#{index + 1}</span>
                        <span className="text-sm text-red-600">{cred.attempts || 0} attempts</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm">
                          <span className="text-cyan-400">USER:</span>
                          <span className="text-yellow-400 ml-2">{username || 'unknown'}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-cyan-400">PASS:</span>
                          <span className="text-yellow-400 ml-2">{password || 'unknown'}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          <div>Success: {(cred.successful || 0) > 0 ?
                            <span className="text-red-500">{cred.successful || 0}</span> :
                            <span className="text-green-500">0</span>}
                          </div>
                          <div>IPs: <span className="text-purple-400">{cred.uniqueIPs || 0}</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Most Used Commands */}
        {analytics && analytics.commands?.topCommands && analytics.commands.topCommands.length > 0 && (
          <div className="bg-gray-900 border border-purple-400 rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-purple-400">
              <h2 className="text-xl font-semibold text-purple-400">
                <span className="text-purple-500">$</span> history | awk '{'{'}print $2{'}'}' | sort | uniq -c | sort -nr
              </h2>
              <p className="text-sm text-purple-600 mt-1">Most executed commands by attackers</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.commands.topCommands.slice(0, 12).map((cmd, index) => (
                  <div key={index} className="bg-black border border-purple-400 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-purple-400">#{index + 1}</span>
                      <span className="text-sm text-purple-600">{cmd.count} times</span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm">
                        <span className="text-cyan-400">CMD:</span>
                        <div className="text-yellow-400 ml-2 font-mono text-xs break-all leading-relaxed mt-1">
                          {cmd.command}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        <div>
                          Frequency: <span className="text-purple-400">{((cmd.count / (analytics.commands?.totalCommands || 1)) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-center text-sm text-purple-600">
                Total Commands: <span className="text-purple-400">{analytics.commands?.totalCommands || 0}</span> |
                Unique Commands: <span className="text-purple-400">{analytics.commands?.uniqueCommands || 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Logs */}
        <div className="bg-gray-900 border border-green-400 rounded-lg">
          <div className="px-6 py-4 border-b border-green-400">
            <h2 className="text-xl font-semibold text-green-400">
              <span className="text-green-500">$</span> tail -f /var/log/honeypot.log ({logs.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-green-400">
              <thead className="bg-black">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    TIMESTAMP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    SRC_IP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    LOCATION
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    EVENT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    USER
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    PASS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-green-400 uppercase tracking-wider">
                    MESSAGE
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-900 divide-y divide-green-800">
                {logs.map((log, index) => (
                  <tr key={index} className="hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-cyan-400">
                      {log.src_ip}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-400">
                      {log.location ? `${log.location.city}, ${log.location.country}` : 'UNKNOWN'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${log.eventid === 'cowrie.login.success' ? 'bg-red-900 text-red-400 border border-red-500' :
                        log.eventid === 'cowrie.login.failed' ? 'bg-yellow-900 text-yellow-400 border border-yellow-500' :
                          log.eventid === 'cowrie.session.connect' ? 'bg-blue-900 text-blue-400 border border-blue-500' :
                            'bg-gray-800 text-gray-400 border border-gray-500'
                        }`}>
                        {log.eventid}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">
                      {log.username || 'NULL'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">
                      {log.password ? '***' : 'NULL'}
                    </td>
                    <td className="px-6 py-4 text-sm text-green-300 max-w-xs truncate">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logs.length === 0 && (
              <div className="text-center py-8">
                <p className="text-green-600">
                  <span className="text-green-500">$</span> No logs found for selected time range
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

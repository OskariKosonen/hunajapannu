const maxmind = require('maxmind');
const { LRUCache } = require('lru-cache');
const { CACHE_CONFIG, GEO_CITY_DB_PATH, GEO_ASN_DB_PATH } = require('./config');

/**
 * MaxMind database readers for city and ASN lookups.
 * Initialized asynchronously on startup.
 */
let geoCityReader = null;
let geoAsnReader = null;

/**
 * In-memory LRU cache for GeoIP lookup results.
 * Reduces database lookups by caching IP addresses.
 */
const geoCache = new LRUCache({
  max: CACHE_CONFIG.MAX_IPS,
  ttl: CACHE_CONFIG.TTL_MS,
});

/**
 * Initializes the MaxMind GeoIP databases.
 * If initialization fails, the server continues without geo enrichment.
 *
 * @async
 * @returns {Promise<void>}
 */
async function initGeoIP() {
  try {
    geoCityReader = await maxmind.open(GEO_CITY_DB_PATH);
    geoAsnReader = await maxmind.open(GEO_ASN_DB_PATH);
    console.log('GeoIP databases loaded successfully');
  } catch (err) {
    console.error('Failed to initialize GeoIP databases, continuing without geo enrichment:', err);
    // Server continues to function; geo lookups will return null
  }
}

/**
 * Performs a GeoIP lookup for the given IP address.
 * Results are cached in memory to improve performance.
 *
 * @param {string} ip - The IP address to look up
 * @returns {Object|null} Geo data containing country_iso, city, asn, and org, or null if unavailable
 */
function lookupGeo(ip) {
  // Guard clause: return early if no IP provided
  if (!ip) return null;

  // Check cache first to avoid repeated lookups
  const cached = geoCache.get(ip);
  if (cached) return cached;

  // If databases aren't loaded, return null
  if (!geoCityReader || !geoAsnReader) return null;

  try {
    // Perform lookups in both city and ASN databases
    const cityRec = geoCityReader.get(ip);
    const asnRec = geoAsnReader.get(ip);

    // Initialize result fields
    let countryIso = null;
    let cityName = null;
    let asn = null;
    let org = null;

    // Extract city and country information
    if (cityRec) {
      // Prefer primary country, fall back to registered country
      if (cityRec.country && cityRec.country.iso_code) {
        countryIso = cityRec.country.iso_code;
      } else if (cityRec.registered_country && cityRec.registered_country.iso_code) {
        countryIso = cityRec.registered_country.iso_code;
      }

      // Extract city name in English
      if (cityRec.city && cityRec.city.names && cityRec.city.names.en) {
        cityName = cityRec.city.names.en;
      }
    }

    // Extract ASN and organization information
    if (asnRec) {
      if (typeof asnRec.autonomous_system_number === 'number') {
        asn = asnRec.autonomous_system_number;
      }
      if (asnRec.autonomous_system_organization) {
        org = asnRec.autonomous_system_organization;
      }
    }

    // Construct result object
    const result = {
      country_iso: countryIso,
      city: cityName,
      asn: asn,
      org: org,
    };

    // Cache the result for future lookups
    geoCache.set(ip, result);
    return result;
  } catch (err) {
    console.error(`GeoIP lookup error for ${ip}:`, err.message);
    return null;
  }
}

module.exports = { initGeoIP, lookupGeo };

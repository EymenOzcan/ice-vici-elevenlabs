const mysql = require('mysql2/promise');
const phpUnserialize = require('php-unserialize');

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'yourdatabase',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL connection successful');
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL connection failed:', error);
    return false;
  }
}


async function getSessionData(id) {
  try {
    const [rows] = await pool.query('SELECT data FROM sessions WHERE id = ?', [id]);
    
    if (!rows[0] || !rows[0].data) {
      return null;
    }
    
    // PHP session format handling
    const sessionData = rows[0].data;
    
    // Parse PHP serialized data
    const parsedData = parsePHPSessionData(sessionData);
    
    return parsedData;
  } catch (error) {
    console.error('Error querying database:', error);
    throw error;
  }
}


/**
 * Parse PHP serialized session data
 * @param {string} sessionData - Raw PHP session data string
 * @returns {Object} Parsed session data object
 */
function parsePHPSessionData(sessionData) {
  try {
    // Extract session ID and serialized content
    const parts = sessionData.split('|');
    const sessionId = parts[0];
    const serializedData = parts[1] || '';
    
    // Basic PHP serialization parser
    const result = {
      sessionId: sessionId,
      data: {}
    };
    
    // Handle PHP serialized array: a:14:{...}
    if (serializedData.startsWith('a:')) {
      // Extract number of items
      const itemCountMatch = serializedData.match(/^a:(\d+):/);
      if (itemCountMatch) {
        const itemCount = parseInt(itemCountMatch[1], 10);
        let remaining = serializedData.substring(itemCountMatch[0].length);
        
        // Remove opening brace
        if (remaining.startsWith('{')) {
          remaining = remaining.substring(1);
        }
        
        // Parse each key-value pair
        for (let i = 0; i < itemCount; i++) {
          // Parse key (assuming string keys: s:length:"keyname";)
          const keyMatch = remaining.match(/^s:(\d+):"([^"]+)";/);
          if (!keyMatch) break;
          
          const key = keyMatch[2];
          remaining = remaining.substring(keyMatch[0].length);
          
          // Determine value type and extract
          if (remaining.startsWith('s:')) {
            // String value
            const valueMatch = remaining.match(/^s:(\d+):"([^"]*)";/);
            if (!valueMatch) break;
            
            result.data[key] = valueMatch[2];
            remaining = remaining.substring(valueMatch[0].length);
          } else if (remaining.startsWith('i:')) {
            // Integer value
            const valueMatch = remaining.match(/^i:(-?\d+);/);
            if (!valueMatch) break;
            
            result.data[key] = parseInt(valueMatch[1], 10);
            remaining = remaining.substring(valueMatch[0].length);
          } else if (remaining.startsWith('b:')) {
            // Boolean value
            const valueMatch = remaining.match(/^b:([01]);/);
            if (!valueMatch) break;
            
            result.data[key] = valueMatch[1] === '1';
            remaining = remaining.substring(valueMatch[0].length);
          } else if (remaining.startsWith('N;')) {
            // NULL value
            result.data[key] = null;
            remaining = remaining.substring(2);
          } else if (remaining.startsWith('a:')) {
            // Nested array (simplified - real implementation would be recursive)
            result.data[key] = '[Complex PHP Array]';
            
            // Skip to the next item (simplified approach)
            const nestedMatch = remaining.match(/^a:\d+:{.*?}/);
            if (nestedMatch) {
              remaining = remaining.substring(nestedMatch[0].length);
            } else {
              break;
            }
          } else {
            // Unknown or unsupported type
            result.data[key] = undefined;
            break;
          }
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing PHP session data:', error);
    return { error: 'Failed to parse session data', raw: sessionData };
  }
}

module.exports = {
  pool,
  testConnection,
  getSessionData
};
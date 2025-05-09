# Technical Context: ElevenLabs AI Call App

## Technologies Used

### Core Technologies
- **Node.js**: Server-side JavaScript runtime
- **WebSockets**: For real-time bidirectional communication
- **Asterisk AudioSocket**: Protocol for audio streaming with Asterisk
- **ElevenLabs API**: Conversational AI and voice synthesis service

### Libraries and Frameworks
- **ws**: WebSocket implementation for Node.js
- **asterisk-manager**: Library for interacting with Asterisk Manager Interface (AMI)
- **elevenlabs**: Official ElevenLabs Node.js SDK
- **dotenv**: Environment variable management
- **uuid**: Generation of unique identifiers
- **net**: Node.js built-in networking for TCP connections
- **stream**: Node.js streams for processing audio data

### Protocols
- **AudioSocket**: Asterisk protocol for bidirectional audio streaming
- **AMI**: Asterisk Manager Interface for call control
- **WebSocket**: Protocol for real-time communication
- **HTTP/HTTPS**: For REST API calls to ElevenLabs

## Development Setup

### Prerequisites
- Node.js (v14.x or higher)
- Access to an Asterisk PBX system with AudioSocket support
- ElevenLabs account with API key and agent configuration
- OSdial/Vicidial installation (for full integration)

### Environment Configuration
Required environment variables in `.env` file:
```
NODE_ENV=development
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_AGENT_ID=your-default-agent-id
ASTERISK_HOST=your-asterisk-server
ASTERISK_PORT=5038
ASTERISK_USER=ami-username
ASTERISK_PASS=ami-password
ASTERISK_UUID=default-connection-id
AUDIOSOCKET_HOST=your-app-hostname
AUDIOSOCKET_PORT_MIN=5052
AUDIOSOCKET_PORT_MAX=5059
API_PORT=58080
```

### Installation Steps
1. Clone the repository
2. Run `npm install` to install dependencies
3. Configure the `.env` file with appropriate values
4. Start the application with `npm start`

### Development Workflow
1. Make code changes
2. Restart the application to apply changes
3. Test with Asterisk calls or the WebSocket API
4. Monitor logs for debugging information

## Technical Constraints

### Performance Constraints
- **Latency**: Audio processing must maintain low latency (<200ms) for natural conversation
- **Concurrency**: System should handle multiple simultaneous calls (limited by port range)
- **Memory Usage**: Node.js memory usage should be monitored, especially with many concurrent calls

### Integration Constraints
- **Asterisk Version**: Requires Asterisk 16+ with AudioSocket support
- **OSdial/Vicidial**: Integration depends on specific OSdial/Vicidial version and configuration
- **Network**: Requires stable network connection between app, Asterisk, and ElevenLabs API

### Security Constraints
- **API Keys**: ElevenLabs API keys must be securely stored
- **AMI Credentials**: Asterisk Manager Interface credentials must be protected
- **Network Security**: WebSocket server should be properly secured if exposed publicly

### Scalability Constraints
- **Port Range**: Limited by configured AudioSocket port range
- **Node.js Event Loop**: May become a bottleneck with very high concurrency
- **ElevenLabs API Limits**: Subject to ElevenLabs API rate limits and quotas

## Dependencies

### Runtime Dependencies
```json
{
  "dependencies": {
    "@fastify/formbody": "^8.0.1",
    "@fastify/websocket": "^11.0.2",
    "alawmulaw": "^6.0.0",
    "asterisk-manager": "^0.2.0",
    "blob": "^0.1.0",
    "dotenv": "^16.4.5",
    "elevenlabs": "^1.54.0",
    "fastify": "^5.2.1",
    "url": "^0.11.4",
    "uuid": "^11.1.0",
    "ws": "^8.18.1"
  }
}
```

### External Dependencies
- **Asterisk PBX**: Call handling and AudioSocket protocol
- **ElevenLabs API**: Conversational AI and voice synthesis
- **OSdial/Vicidial**: Call center suite (for integration)

### Dependency Management
- Dependencies are managed via npm
- Package versions are locked in package-lock.json
- Regular updates should be performed to maintain security

## Infrastructure Requirements

### Server Requirements
- **CPU**: Multi-core processor recommended for concurrent call handling
- **Memory**: Minimum 2GB RAM, 4GB+ recommended for production
- **Disk**: Minimal requirements, primarily for logs
- **Network**: Low-latency connection to Asterisk server and internet (for ElevenLabs API)

### Network Requirements
- **Ports**: API_PORT (default: 58080) must be accessible for WebSocket clients
- **Connectivity**: Must have network access to Asterisk server
- **Bandwidth**: Sufficient for audio streaming (approximately 64 Kbps per call)
- **Latency**: Low latency connection to ElevenLabs API recommended

### Deployment Options
- **Direct**: Run directly on the Asterisk/OSdial server
- **Separate Server**: Run on a separate server with network access to Asterisk
- **Container**: Can be containerized with Docker for easier deployment
- **Cloud**: Can run in cloud environments with proper network configuration

## Monitoring and Logging

### Logging Strategy
- Console logging for operational events
- WebSocket forwarding of logs to connected clients
- Error logging for exception tracking
- Connection and call status logging

### Monitoring Points
- WebSocket connection status
- Active call count
- Port allocation status
- ElevenLabs API connection health
- Asterisk AMI connection status

### Health Checks
- WebSocket server availability
- Asterisk AMI connection
- Port availability
- Memory usage
- Active connections count

### Database Structure
- You can find DB Structure of MySQL in database.md file
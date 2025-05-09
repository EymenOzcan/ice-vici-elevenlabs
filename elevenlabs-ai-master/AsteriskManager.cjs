require('dotenv').config();
const AsteriskManager = require('asterisk-manager');

class AsteriskService {
  destructor() {
    this.ami.disconnect();  
  }

  constructor() {
    this.ASTERISK_HOST = process.env.ASTERISK_HOST || 'localhost';
    this.ASTERISK_PORT = process.env.ASTERISK_PORT || 5038;
    this.ASTERISK_USER = process.env.ASTERISK_USER;
    this.ASTERISK_PASS = process.env.ASTERISK_PASS;
    this.ami = new AsteriskManager(
      this.ASTERISK_PORT,
      this.ASTERISK_HOST,
      this.ASTERISK_USER,
      this.ASTERISK_PASS,
      true // Keep connection alive
    );
  

    this.ami.keepConnected();

    this.ami.on('connect', () => {
      console.log('[Asterisk AMI] Connected');
    });

    this.ami.on('error', (err) => {
      console.error('[Asterisk AMI] Error:', err);
    });

    this.ami.on('disconnect', () => {
      console.log('[Asterisk AMI] Disconnected');
    });
  }

  async originateCall(channel, connectionId, port = 5051) {
    return new Promise((resolve, reject) => {
      const host = process.env.AUDIOSOCKET_HOST || 'dev.dial24.net';
      
      this.ami.action({
        action: 'Originate',
        channel: channel,
        callerid: '4921612963110 <4921612963110>',
        application: 'AudioSocket',
        data: `${connectionId},${host}:${port}`, // Now use dynamic port
      }, (err, res) => {
        if (err) {
          console.error('Originate error:', err);
          reject(err);
        } else {
          console.log(`Originate response for connection ${connectionId} using port ${port}:`, res);
          resolve(res);
        }
      });
    });
  }

  async hangupCall(channel) {
    return new Promise((resolve, reject) => {
      this.ami.action({
        action: 'Hangup',
        channel: channel
      }, (err, res) => {
        if (err) {
          console.error('Hangup error:', err);
          reject(err);
        } else {
          console.log('Hangup response:', res);
          resolve(res);
        }
      });
    });
  }

  async getChannels() {
    return new Promise((resolve, reject) => {
        const channelList = [];
        
        // Create a named handler function that we can remove later
        const eventHandler = (evt) => {
            if (evt.event === 'CoreShowChannel') {
                if (evt.channel.match(/^AudioSocket/) || evt.application.match(/^AudioSocket/)  || evt.applicationdata.match(/^AudioSocket/)) {
                    let audioSocketPort = null;
                    const match = evt.channel.match(/:(\d+)-/);
                    if (match) {
                        audioSocketPort = parseInt(match[1], 10);
                    }
                    channelList.push({ ...evt, audioSocketPort });
                }
            } else if (evt.event === 'CoreShowChannelsComplete') {
                // Remove the listener before resolving
                this.ami.removeListener('managerevent', eventHandler);
                resolve(channelList || null);
            }
        };

        // Add the listener
        this.ami.on('managerevent', eventHandler);
        
        this.ami.action({ action: 'CoreShowChannels' }, (err) => {
            if (err) {
              console.error('CoreShowChannels error:', err);
              // Remove listener on error too to prevent leak
              this.ami.removeListener('managerevent', eventHandler);
              reject(err);
            }
        });
        
        // Optional: Add a timeout to prevent hanging promises
        setTimeout(() => {
            this.ami.removeListener('managerevent', eventHandler);
            reject(new Error('CoreShowChannels timed out'));
        }, 10000); // 10 second timeout
    });
  }

  async transferCall(extension) {
    return new Promise((resolve, reject) => {
      const channelList = [];
      this.ami.on('managerevent', (evt) => {
        if (evt.event === 'CoreShowChannel') {
          channelList.push(evt);
        } else if (evt.event === 'CoreShowChannelsComplete') {
          const upChannels = channelList.filter((c) => c.channelstatedesc === 'Up' && c.application === 'Dial');
          if (!upChannels.length) {
            console.log('No active channels found to transfer.');
            reject('No active channels found.');
            return;
          }

          if (upChannels.length > 0 && extension) {
            const channelToTransfer = upChannels[0].channel;
            console.log(`Attempting call transfer for channel ${channelToTransfer} to extension ${extension}`);

            this.ami.action(
              {
                action: 'Redirect',
                channel: channelToTransfer,
                context: 'test',
                exten: extension,
                priority: 1,
              },
              (redirectErr, redirectRes) => {
                if (redirectErr) {
                  console.error('Redirect error:', redirectErr);
                  reject(redirectErr);
                } else {
                  console.log('Redirect response:', redirectRes);
                  resolve(redirectRes);
                }
              }
            );
          } else {
            reject('No extension provided or no active channels.');
          }
        }
      });

      this.ami.action({ action: 'CoreShowChannels' }, (coreErr, coreRes) => {
        if (coreErr) {
          console.error('CoreShowChannels error:', coreErr);
          reject(coreErr);
        } else {
          console.log('CoreShowChannels response:', coreRes);
        }
      });
    });
  }

  disconnect() {
    this.ami.disconnect();
  }
}

module.exports = AsteriskService;

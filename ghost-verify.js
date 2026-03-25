const net = require('net');
const https = require('https');

const proxyHost = '127.0.0.1';
const proxyPort = 9150;
const targetHost = 'check.torproject.org';
const targetPort = 443;

const client = net.createConnection({ host: proxyHost, port: proxyPort });

client.on('connect', () => {
  console.log('Connected to SOCKS proxy, sending handshake...');
  
  const socksHandshake = Buffer.from([
    0x05, // SOCKS version 5
    0x01, // 1 authentication method
    0x00  // No authentication
  ]);
  
  client.write(socksHandshake);
});

client.on('data', (data) => {
  if (data[0] === 0x05 && data[1] === 0x00) {
    // Auth successful, now send connect request
    const connectRequest = Buffer.alloc(7 + targetHost.length);
    connectRequest[0] = 0x05; // SOCKS version 5
    connectRequest[1] = 0x01; // Connect command
    connectRequest[2] = 0x00; // Reserved
    connectRequest[3] = 0x03; // Domain name
    connectRequest[4] = targetHost.length; // Length of domain
    Buffer.from(targetHost).copy(connectRequest, 5);
    connectRequest[5 + targetHost.length] = (targetPort >> 8) & 0xFF;
    connectRequest[6 + targetPort.length] = targetPort & 0xFF;
    
    console.log('Auth OK, sending connect request...');
    client.write(connectRequest);
  } else if (data[0] === 0x05 && data[1] === 0x00) {
    // Connection established
    console.log('Connected via Tor, fetching IP...');
    
    const req = https.get('https://check.torproject.org/api/ip', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          console.log(JSON.stringify(json, null, 2));
          if (json.IsTor === true) {
            console.log('\n✅ GHOST VERIFICATION PASSED - Tor routing confirmed');
          } else {
            console.log('\n❌ GHOST VERIFICATION FAILED - Not routed through Tor');
          }
          client.end();
          process.exit(0);
        } catch (e) {
          console.log('Failed to parse response:', body);
          client.end();
          process.exit(1);
        }
      });
    });
    
    req.on('error', (e) => {
      console.log('Request failed:', e.message);
      client.end();
      process.exit(1);
    });
    
    req.end();
  } else {
    console.log('Unexpected response:', data);
    client.end();
    process.exit(1);
  }
});

client.on('error', (e) => {
  console.log('Socket error:', e.message);
  process.exit(1);
});

const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 1234,
  path: '/v1/models',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => {
  console.error(`Fout: ${e.message}`);
});

req.end();
const http = require('http');

const data = JSON.stringify({
  text: "Today was a good day. I feel productive and happy about my progress on the MindSpace project."
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/diary/analyze',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Problem with request:', e.message);
  process.exit(1);
});

req.write(data);
req.end();

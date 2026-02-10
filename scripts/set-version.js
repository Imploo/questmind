const fs = require('fs');
const v = Date.now().toString();
fs.writeFileSync('src/version.json', JSON.stringify({ v }));
console.log('Version set to', v);

const fs = require('fs');
const txt = fs.readFileSync('fixtures/daybook/sample-daybook.csv', 'utf8');
function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  cols.push(cur.trim());
  return cols;
}
const rows = txt.split('\n').map(parseCsvLine);
console.log('Header:', rows[4]);
console.log('Row 6 (Sri Steel Traders):', rows[6]);
console.log('Row 7 (CGST):', rows[7]);

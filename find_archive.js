const fs = require('fs');
const path = require('path');
function walk(dir) {
  let res = [];
  try {
    for (let f of fs.readdirSync(dir)) {
      let fp = path.join(dir, f);
      let st = fs.statSync(fp);
      if (st.isDirectory()) res = res.concat(walk(fp));
      else if (/\.(js|jsx|ts|tsx)$/.test(fp)) res.push(fp);
    }
  } catch(e) {}
  return res;
}
let files = walk('src');
for (let f of files) {
  let c = fs.readFileSync(f, 'utf8');
  if (c.includes('archive') && c.includes('admin-operations')) {
    console.log(f);
    break;
  }
}

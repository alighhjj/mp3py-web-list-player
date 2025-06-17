const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'player.js');
const content = fs.readFileSync(filePath, 'utf8');

try {
    new Function(content);
    console.log('✅ 语法检查通过：没有发现语法错误');
} catch (e) {
    console.error('❌ 语法错误:', e.message);
    process.exit(1);
}
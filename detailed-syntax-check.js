const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'player.js');
const content = fs.readFileSync(filePath, 'utf8');

// 分行检查
const lines = content.split('\n');
console.log(`文件总行数: ${lines.length}`);

// 检查括号匹配
let openParens = 0;
let openBraces = 0;
let openBrackets = 0;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    switch (char) {
        case '(':
            openParens++;
            break;
        case ')':
            openParens--;
            break;
        case '{':
            openBraces++;
            break;
        case '}':
            openBraces--;
            break;
        case '[':
            openBrackets++;
            break;
        case ']':
            openBrackets--;
            break;
    }
}

console.log(`括号匹配检查:`);
console.log(`圆括号: ${openParens === 0 ? '✅ 匹配' : '❌ 不匹配 (' + openParens + ')'}`);
console.log(`大括号: ${openBraces === 0 ? '✅ 匹配' : '❌ 不匹配 (' + openBraces + ')'}`);
console.log(`方括号: ${openBrackets === 0 ? '✅ 匹配' : '❌ 不匹配 (' + openBrackets + ')'}`);

// 尝试解析JavaScript
try {
    new Function(content);
    console.log('✅ JavaScript语法检查通过');
} catch (e) {
    console.error('❌ JavaScript语法错误:', e.message);
    
    // 尝试找到错误位置
    if (e.message.includes('line')) {
        const match = e.message.match(/line (\d+)/);
        if (match) {
            const lineNum = parseInt(match[1]);
            console.log(`错误可能在第 ${lineNum} 行:`);
            console.log(lines[lineNum - 1]);
        }
    }
}
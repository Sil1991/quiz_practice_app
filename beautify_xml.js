const fs = require('fs');
const path = require('path');

// 读取XML文件
const xmlPath = path.join(__dirname, 'data', 'pdf_parsed.xml');
const xmlContent = fs.readFileSync(xmlPath, 'utf8');

// 解析XML内容，提取题目和答案
function parseQuestionsFromXML(xmlContent) {
  const questions = [];
  
  // 提取content标签内容
  const contentMatch = xmlContent.match(/<content>([\s\S]*?)<\/content>/g);
  if (contentMatch) {
    let allContent = contentMatch.map(match => match.replace(/<content>([\s\S]*?)<\/content>/, '$1')).join('\n');
    
    // 先处理CDATA，提取实际内容（保留highlight标签）
    allContent = allContent.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    
    // 在问题编号前添加换行
    allContent = allContent.replace(/(\d+\.[A-Za-z])/g, '\n$1');
    // 在选项前添加换行
    allContent = allContent.replace(/([A-D]\.)/g, '\n$1');
    // 在答案前添加换行
    allContent = allContent.replace(/(答案\s*:)/g, '\n答案:');
    // 清理答案格式（移除空格）
    allContent = allContent.replace(/答案\s*:/g, '答案:');
    
    const lines = allContent.split('\n');
    let question = null;
    let options = [];
    let answer = null;
    let questionBuffer = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // 匹配问题行（格式：1.A company...）
      const lineWithoutTags = line.replace(/<[^>]+>/g, '');
      if (/^\d+\.[A-Za-z]/.test(lineWithoutTags)) {
        // 保存之前的问题
        if (question && options.length >= 2 && answer) {
          // 清理选项，确保只有A-D的选项
          const validOptions = options.filter(option => {
            const optionWithoutTags = option.replace(/<[^>]+>/g, '');
            return /^[A-D]\./.test(optionWithoutTags);
          });
          if (validOptions.length >= 2) {
            // 提取题目编号
            const match = question.replace(/<[^>]+>/g, '').match(/^(\d+)\./);
            const questionNumber = match ? parseInt(match[1]) : 0;
            
            questions.push({
              number: questionNumber,
              question: question,
              options: validOptions,
              answer: answer
            });
          }
        }

        // 开始新问题
        question = line;
        options = [];
        answer = null;
        questionBuffer = [line];
      } else if (/^[A-D]\./.test(lineWithoutTags)) {
        // 匹配选项行
        options.push(line);
      } else if (line.startsWith('答案:')) {
        // 匹配答案行
        answer = line;
      } else {
        // 问题的其他行
        if (question && options.length === 0 && !answer) {
          question += ' ' + line;
        }
      }
    }
    
    // 保存最后一个问题
    if (question && options.length >= 2 && answer) {
      // 清理选项，确保只有A-D的选项
      const validOptions = options.filter(option => {
        const optionWithoutTags = option.replace(/<[^>]+>/g, '');
        return /^[A-D]\./.test(optionWithoutTags);
      });
      if (validOptions.length >= 2) {
        // 提取题目编号
        const match = question.replace(/<[^>]+>/g, '').match(/^(\d+)\./);
        const questionNumber = match ? parseInt(match[1]) : 0;
        
        questions.push({
          number: questionNumber,
          question: question,
          options: validOptions,
          answer: answer
        });
      }
    }
  }
  
  return questions;
}

// 解析题目
const questions = parseQuestionsFromXML(xmlContent);

// 按题目序号排序
questions.sort((a, b) => a.number - b.number);

// 生成HTML
function generateHTML(questions) {
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIF-C01 问答测试</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 30px;
    }
    .question {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #eee;
    }
    .question-number {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .question-text {
      margin-bottom: 15px;
      line-height: 1.8;
    }
    .options {
      margin-bottom: 15px;
    }
    .option {
      margin-bottom: 8px;
      padding-left: 20px;
    }
    .answer {
      font-weight: bold;
      color: #0066cc;
    }
    .highlight {
      background-color: #e6f9e6;
      padding: 2px 4px;
      border-radius: 2px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>AIF-C01 问答测试</h1>
`;
  
  questions.forEach(q => {
    // 提取题目内容，移除题目编号
    const questionContent = q.question.replace(/^\d+\./, '').trim();
    
    html += `    <div class="question">
      <div class="question-number">${q.number}. ${questionContent}</div>
      <div class="options">
`;
    q.options.forEach(option => {
      html += `        <div class="option">${option}</div>
`;
    });
    html += `      </div>
      <div class="answer">${q.answer}</div>
    </div>
`;
  });
  
  html += `  </div>
</body>
</html>`;
  
  return html;
}

// 生成HTML内容
const htmlContent = generateHTML(questions);

// 保存到HTML文件
const htmlPath = path.join(__dirname, 'data', 'q_and_a.html');
fs.writeFileSync(htmlPath, htmlContent);

console.log(`成功生成HTML文件：${htmlPath}`);
console.log(`共处理了 ${questions.length} 个问题`);

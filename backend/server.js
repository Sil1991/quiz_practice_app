const express = require('express');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// 解析 PDF 文件
function parseQuestions(text) {
  // 处理页面分隔符
  text = text.replace(/===== Page \d+ =====/g, '\n\n');
  // 清理多余的换行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  const lines = text.split('\n');
  const questions = [];
  let question = null;
  let options = [];
  let answer = null;
  let questionBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 匹配问题行（格式：1.A company...）
    if (/^\d+\.[A-Za-z]/.test(line)) {
      // 保存之前的问题
      if (question && options.length >= 2 && answer) {
        questions.push({
          question: question,
          options: options,
          answer: answer,
          is_multiple: isMultipleChoice(question)
        });
      }
      
      // 开始新问题
      question = line;
      options = [];
      answer = null;
      questionBuffer = [line];
      continue;
    }

    // 匹配选项行（格式：A.Code for model training）
    if (/^[A-D]\..+/.test(line)) {
      // 检查是否是新的选项序列（A开始）
      if (line.startsWith('A.') && options.length > 0) {
        // 保存之前的问题
        if (question && options.length >= 2 && answer) {
          questions.push({
            question: question,
            options: options,
            answer: answer,
            is_multiple: isMultipleChoice(question)
          });
        }
        // 开始新问题
        question = null;
        options = [line];
        answer = null;
        questionBuffer = [];
      } else {
        options.push(line);
      }
      continue;
    }

    // 匹配答案行（格式：答案:B）
    if (line.startsWith('答案:')) {
      answer = line;
      continue;
    }

    // 问题文本的延续
    if (question && options.length === 0 && !answer) {
      questionBuffer.push(line);
      question = questionBuffer.join(' ');
      continue;
    }
  }

  // 保存最后一个问题
  if (question && options.length >= 2 && answer) {
    questions.push({
      question: question,
      options: options,
      answer: answer,
      is_multiple: isMultipleChoice(question)
    });
  }

  return questions;
}

// 检查是否是多选题
function isMultipleChoice(questionText) {
  if (questionText.includes('多选题') || questionText.includes('（多选）')) {
    return true;
  }
  if (/Select\s+(TWO|THREE|FOUR|2|3|4)/i.test(questionText)) {
    return true;
  }
  return false;
}

// 解析正确答案
function parseCorrectAnswer(answerText) {
  const letters = [];
  if (answerText) {
    const match = answerText.match(/答案\s*:\s*([A-D\s,]+)/);
    if (match) {
      const answerPart = match[1];
      letters.push(...answerPart.match(/[A-D]/gi).map(l => l.toUpperCase()));
    }
  }
  return letters.length ? letters : ['A'];
}

// 生成随机测试题
function generateQuiz(questions, num = 10) {
  if (questions.length < num) {
    num = questions.length;
  }
  
  const shuffled = [...questions].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, num);
}

// 读取PDF文件
async function loadPDF() {
  const pdfPath = path.join(__dirname, '..', 'data', 'AIF-C01 Exam Q&A(224)-1.pdf');
  console.log(`PDF文件路径: ${pdfPath}`);
  console.log(`PDF文件是否存在: ${fs.existsSync(pdfPath)}`);
  
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    console.log(`PDF文件大小: ${dataBuffer.length} 字节`);
    const data = await pdf(dataBuffer);
    console.log(`PDF内容长度: ${data.text.length} 字符`);
    console.log(`PDF页数: ${data.numpages}`);
    
    // 保存前1000个字符的内容到文件，以便分析
    const sampleText = data.text.substring(0, 1000);
    fs.writeFileSync('pdf_sample.txt', sampleText);
    console.log('PDF样本已保存到 pdf_sample.txt');
    
    const questions = parseQuestions(data.text);
    console.log(`解析出的问题数量: ${questions.length}`);
    
    if (questions.length > 0) {
      console.log('第一个问题:', questions[0].question);
      console.log('第一个问题的选项:', questions[0].options);
      console.log('第一个问题的答案:', questions[0].answer);
    }
    
    return questions;
  } catch (error) {
    console.error('读取PDF文件出错:', error);
    throw error;
  }
}

// API 路由
app.get('/api/questions', async (req, res) => {
  try {
    console.log('收到请求：/api/questions');
    const questions = await loadPDF();
    console.log(`解析出 ${questions.length} 个问题`);
    const quiz = generateQuiz(questions);
    console.log(`生成 ${quiz.length} 个测试题`);
    res.json(quiz);
  } catch (error) {
    console.error('API错误:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-answer', (req, res) => {
  const { question, selected, isMultiple } = req.body;
  
  try {
    const correctLetters = parseCorrectAnswer(question.answer);
    
    let isCorrect = false;
    if (isMultiple) {
      isCorrect = new Set(selected).size === correctLetters.length && 
                 selected.every(letter => correctLetters.includes(letter));
    } else {
      isCorrect = selected.length === 1 && correctLetters.includes(selected[0]);
    }
    
    res.json({ isCorrect, correctLetters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 扩展 String 方法
String.prototype.rstrip = function() {
  return this.replace(/\s+$/g, '');
};

String.prototype.strip = function() {
  return this.trim();
};

// 确保方法存在
if (!String.prototype.rstrip) {
  String.prototype.rstrip = function() {
    return this.replace(/\s+$/g, '');
  };
}

if (!String.prototype.strip) {
  String.prototype.strip = function() {
    return this.trim();
  };
}

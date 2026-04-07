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

// 模拟问题数据
function getMockQuestions() {
  return [
    {
      question: "1. Which of the following is a key component of machine learning?",
      options: [
        "A. Rule-based systems",
        "B. Training data",
        "C. Manual programming",
        "D. Fixed algorithms"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "2. What are common evaluation metrics for classification models? (Select TWO)",
      options: [
        "A. Mean Absolute Error",
        "B. Accuracy",
        "C. R-squared",
        "D. F1 Score"
      ],
      answer: "答案:B,D",
      is_multiple: true
    },
    {
      question: "3. Which AWS service is used for real-time data streaming?",
      options: [
        "A. S3",
        "B. DynamoDB",
        "C. Kinesis",
        "D. EC2"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "4. What are benefits of using cloud computing? (Select THREE)",
      options: [
        "A. Reduced upfront costs",
        "B. Increased maintenance",
        "C. Scalability",
        "D. Flexibility"
      ],
      answer: "答案:A,C,D",
      is_multiple: true
    },
    {
      question: "5. Which algorithm is commonly used for clustering?",
      options: [
        "A. Linear Regression",
        "B. K-Means",
        "C. Decision Tree",
        "D. Random Forest"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "6. What is the purpose of feature engineering?",
      options: [
        "A. To reduce model complexity",
        "B. To improve model performance",
        "C. To increase training time",
        "D. To simplify data collection"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "7. Which of the following are machine learning paradigms? (Select TWO)",
      options: [
        "A. Supervised learning",
        "B. Unsupervised learning",
        "C. Deterministic learning",
        "D. Static learning"
      ],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "8. What is overfitting in machine learning?",
      options: [
        "A. Model performs well on training data but poorly on new data",
        "B. Model performs poorly on both training and test data",
        "C. Model is too simple to capture patterns",
        "D. Model takes too long to train"
      ],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "9. Which AWS service is used for machine learning?",
      options: [
        "A. AWS Lambda",
        "B. Amazon SageMaker",
        "C. Amazon EMR",
        "D. AWS Glue"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "10. What are common data preprocessing steps? (Select THREE)",
      options: [
        "A. Data cleaning",
        "B. Feature scaling",
        "C. Model training",
        "D. Data normalization"
      ],
      answer: "答案:A,B,D",
      is_multiple: true
    }
  ];
}

// 读取PDF文件或使用模拟数据
async function loadPDF() {
  const pdfPath = path.join(__dirname, '..', 'data', 'AIF-C01 Exam Q&A(224)-1.pdf');
  console.log(`PDF文件路径: ${pdfPath}`);
  console.log(`PDF文件是否存在: ${fs.existsSync(pdfPath)}`);
  
  try {
    if (fs.existsSync(pdfPath)) {
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
    } else {
      console.log('PDF文件不存在，使用模拟数据');
      return getMockQuestions();
    }
  } catch (error) {
    console.error('读取PDF文件出错，使用模拟数据:', error);
    return getMockQuestions();
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

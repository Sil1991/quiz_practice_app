const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const cors = require('cors');
const pdfjsLib = require('pdfjs-dist');
const pdfjsWorker = require('pdfjs-dist/build/pdf.worker.entry');
const { parseStringPromise } = require('xml2js');

// 设置PDF.js工作器
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

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

    // 选项文本的延续（非空行且不是新的选项或答案）
    if (options.length > 0 && !answer && line.trim()) {
      const lastOption = options[options.length - 1];
      options[options.length - 1] = lastOption + ' ' + line.trim();
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
function generateQuiz(questions, num = 10, shuffleAnswers = false) {
  if (questions.length < num) {
    num = questions.length;
  }
  
  const shuffled = [...questions].sort(() => 0.5 - Math.random());
  const quiz = shuffled.slice(0, num);
  
  if (shuffleAnswers) {
    quiz.forEach(question => {
      if (question.options && Array.isArray(question.options)) {
        // 提取选项内容（去掉前缀）
        const contents = question.options.map(option => option.substring(2));
        // 记录原始正确答案的内容
        let correctContent = null;
        if (question.answer) {
          const correctLetter = question.answer.match(/答案:([A-Z,]+)/);
          if (correctLetter) {
            const letters = correctLetter[1].split(',').map(l => l.trim());
            if (letters.length === 1) {
              const index = letters[0].charCodeAt(0) - 65;
              if (index >= 0 && index < contents.length) {
                correctContent = contents[index];
              }
            }
          }
        }
        // 打乱内容
        contents.sort(() => 0.5 - Math.random());
        // 重新添加前缀
        question.options = contents.map((content, index) => {
          const prefix = String.fromCharCode(65 + index); // A, B, C, D...
          return `${prefix}.${content}`;
        });
        // 更新正确答案
        if (correctContent) {
          const newIndex = contents.indexOf(correctContent);
          if (newIndex !== -1) {
            const newCorrectLetter = String.fromCharCode(65 + newIndex);
            question.answer = `答案:${newCorrectLetter}`;
          }
        }
      }
    });
  }
  
  return quiz;
}

// 从XML文件中解析问题和答案
async function parseQuestionsFromXML() {
  const xmlPath = path.join(__dirname, '..', 'data', 'pdf_parsed.xml');
  console.log(`XML文件路径: ${xmlPath}`);
  
  if (!fs.existsSync(xmlPath)) {
    console.error('XML文件不存在');
    return [];
  }
  
  try {
    // 读取XML文件
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    
    // 解析XML
    const parsedXml = await parseStringPromise(xmlContent);
    
    // 提取所有页面内容
    const pages = parsedXml.pdf.page;
    let allContent = '';
    
    // 合并所有页面的内容
    for (const page of pages) {
      if (page.content && page.content[0]) {
        allContent += page.content[0];
      }
    }
    
    // 处理文本，添加适当的换行符
    // 移除XML标签
    allContent = allContent.replace(/<[^>]+>/g, '');
    // 清理多余的空白字符
    allContent = allContent.replace(/\s+/g, ' ').trim();
    // 在问题编号前添加换行
    allContent = allContent.replace(/(\d+\.[A-Za-z])/g, '\n$1');
    // 在选项前添加换行
    allContent = allContent.replace(/([A-D]\.)/g, '\n$1');
    // 在答案前添加换行
    allContent = allContent.replace(/(答案\s*:)/g, '\n答案:');
    // 清理答案格式（移除空格）
    allContent = allContent.replace(/答案\s*:/g, '答案:');
    
    // 使用现有的parseQuestions函数解析内容
    const questions = parseQuestions(allContent);
    console.log(`从XML解析出的问题数量: ${questions.length}`);
    
    return questions;
  } catch (error) {
    console.error('解析XML文件出错:', error);
    return [];
  }
}

// 解析PDF并生成XML格式，包含高亮信息
async function parsePDFToXML() {
  const pdfPath = path.join(__dirname, '..', 'data', 'AIF-C01 Exam Q&A(224)-1.pdf');
  console.log(`PDF文件路径: ${pdfPath}`);
  
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF文件不存在');
    return null;
  }
  
  try {
    // 读取PDF文件
    const dataBuffer = fs.readFileSync(pdfPath);
    // 将Buffer转换为Uint8Array
    const uint8Array = new Uint8Array(dataBuffer);
    const pdfDocument = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    
    let xmlContent = '<?xml version="1.0" encoding="UTF-8"?><pdf>';
    
    // 遍历每一页
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      xmlContent += `<page number="${pageNum}">`;
      
      // 提取文本内容
      const content = await page.getTextContent();
      let textContent = '';
      
      // 提取注释（高亮）
      const annotations = await page.getAnnotations();
      const highlights = [];
      
      // 收集所有高亮注释
      for (const annot of annotations) {
        if (annot.subtype === 'Highlight') {
          // 提取高亮的文本
          const rect = annot.rect;
          const textItems = content.items.filter(item => {
            const itemRect = item.transform;
            // 简单的位置判断，实际可能需要更复杂的逻辑
            return itemRect[4] >= rect[1] && itemRect[4] <= rect[3];
          });
          
          if (textItems.length > 0) {
            const highlightedText = textItems.map(item => item.str).join(' ');
            highlights.push({
              text: highlightedText,
              color: annot.color ? annot.color : [0.486, 0.784, 0.408] // 默认绿色
            });
          }
        }
      }
      
      // 构建页面文本，标记高亮部分
      let currentIndex = 0;
      const pageText = content.items.map(item => item.str).join(' ');
      
      // 简单的高亮标记实现
      // 实际项目中可能需要更精确的文本匹配和位置计算
      let processedText = pageText;
      for (const highlight of highlights) {
        if (highlight.text && highlight.text.trim()) {
          // 转义正则表达式中的特殊字符
          const escapedText = highlight.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedText, 'gi');
          processedText = processedText.replace(regex, `<highlight color="rgb(${Math.round(highlight.color[0] * 255)},${Math.round(highlight.color[1] * 255)},${Math.round(highlight.color[2] * 255)})">${highlight.text}</highlight>`);
        }
      }
      
      xmlContent += `<content>${processedText}</content>`;
      xmlContent += `</page>`;
    }
    
    xmlContent += '</pdf>';
    
    // 确保data目录存在
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 保存XML文件
    const xmlPath = path.join(dataDir, 'pdf_parsed.xml');
    fs.writeFileSync(xmlPath, xmlContent);
    console.log(`PDF解析结果已保存到: ${xmlPath}`);
    
    return xmlContent;
  } catch (error) {
    console.error('解析PDF生成XML时出错:', error);
    return null;
  }
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
    },
    {
      question: "11. Which of the following is a supervised learning algorithm?",
      options: [
        "A. K-Means",
        "B. Principal Component Analysis",
        "C. Linear Regression",
        "D. Hierarchical Clustering"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "12. What is the purpose of cross-validation? (Select TWO)",
      options: [
        "A. To prevent overfitting",
        "B. To reduce training time",
        "C. To evaluate model performance",
        "D. To increase model complexity"
      ],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "13. Which AWS service provides managed relational databases?",
      options: [
        "A. Amazon RDS",
        "B. Amazon DynamoDB",
        "C. Amazon Redshift",
        "D. Amazon ElastiCache"
      ],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "14. What are advantages of using containers? (Select THREE)",
      options: [
        "A. Consistent environment",
        "B. Increased resource usage",
        "C. Faster deployment",
        "D. Better scalability"
      ],
      answer: "答案:A,C,D",
      is_multiple: true
    },
    {
      question: "15. Which algorithm is used for dimensionality reduction?",
      options: [
        "A. Random Forest",
        "B. Support Vector Machines",
        "C. Principal Component Analysis",
        "D. Gradient Boosting"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "16. What is the role of a loss function in machine learning?",
      options: [
        "A. To measure model performance",
        "B. To increase model accuracy",
        "C. To reduce training time",
        "D. To prevent overfitting"
      ],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "17. Which AWS services are part of the serverless computing paradigm? (Select TWO)",
      options: [
        "A. EC2",
        "B. Lambda",
        "C. S3",
        "D. API Gateway"
      ],
      answer: "答案:B,D",
      is_multiple: true
    },
    {
      question: "18. What is the difference between batch processing and stream processing?",
      options: [
        "A. Batch processing handles data in real-time",
        "B. Stream processing processes data in large chunks",
        "C. Batch processing is for historical data analysis",
        "D. Stream processing is slower than batch processing"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "19. Which of the following are hyperparameters in machine learning? (Select THREE)",
      options: [
        "A. Learning rate",
        "B. Number of hidden layers",
        "C. Model weights",
        "D. Batch size"
      ],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "20. What is the purpose of AWS CloudFormation?",
      options: [
        "A. To automate infrastructure deployment",
        "B. To monitor cloud resources",
        "C. To store data in the cloud",
        "D. To process big data"
      ],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "21. What is the primary purpose of a neural network activation function?",
      options: [
        "A. To store weights",
        "B. To introduce non-linearity",
        "C. To reduce model size",
        "D. To speed up training"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "22. Which AWS services can be used for data storage? (Select TWO)",
      options: [
        "A. Amazon S3",
        "B. AWS Lambda",
        "C. Amazon DynamoDB",
        "D. Amazon EC2"
      ],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "23. What is the purpose of regularization in machine learning?",
      options: [
        "A. To increase model complexity",
        "B. To prevent overfitting",
        "C. To speed up training",
        "D. To increase training data"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "24. Which of the following are types of neural networks? (Select THREE)",
      options: [
        "A. Convolutional Neural Network",
        "B. Linear Neural Network",
        "C. Recurrent Neural Network",
        "D. Transformer"
      ],
      answer: "答案:A,C,D",
      is_multiple: true
    },
    {
      question: "25. What is the main advantage of using AWS Lambda?",
      options: [
        "A. Dedicated servers",
        "B. Pay-per-use pricing",
        "C. Long-running processes",
        "D. Manual scaling"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "26. What is gradient descent used for in machine learning?",
      options: [
        "A. Data preprocessing",
        "B. Feature selection",
        "C. Optimization of model parameters",
        "D. Model evaluation"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "27. Which AWS services support big data analytics? (Select TWO)",
      options: [
        "A. Amazon EMR",
        "B. Amazon S3",
        "C. Amazon Redshift",
        "D. Amazon RDS"
      ],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "28. What is the purpose of a confusion matrix?",
      options: [
        "A. To visualize model architecture",
        "B. To evaluate classification performance",
        "C. To preprocess data",
        "D. To reduce dimensionality"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "29. What are common challenges in machine learning? (Select THREE)",
      options: [
        "A. Overfitting",
        "B. Underfitting",
        "C. Fast training",
        "D. Data quality issues"
      ],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "30. Which AWS service provides content delivery network (CDN) capabilities?",
      options: [
        "A. Amazon S3",
        "B. Amazon CloudFront",
        "C. Amazon Route 53",
        "D. Amazon VPC"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "31. What is transfer learning in deep learning?",
      options: [
        "A. Training from scratch",
        "B. Using pre-trained models for new tasks",
        "C. Transferring data between servers",
        "D. Moving models to production"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "32. Which techniques can help prevent overfitting? (Select TWO)",
      options: [
        "A. Dropout",
        "B. Adding more layers",
        "C. Early stopping",
        "D. Increasing model complexity"
      ],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "33. What is the purpose of Amazon S3?",
      options: [
        "A. Running virtual machines",
        "B. Object storage",
        "C. Database management",
        "D. Content delivery"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "34. What are common data types in machine learning? (Select THREE)",
      options: [
        "A. Numerical data",
        "B. Categorical data",
        "C. Algorithm data",
        "D. Text data"
      ],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "35. What is the role of an optimizer in deep learning?",
      options: [
        "A. To generate training data",
        "B. To update model weights",
        "C. To evaluate model performance",
        "D. To preprocess input data"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "36. Which AWS services are used for message queuing? (Select TWO)",
      options: [
        "A. Amazon SQS",
        "B. Amazon SNS",
        "C. Amazon S3",
        "D. Amazon EC2"
      ],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "37. What is the difference between classification and regression?",
      options: [
        "A. Classification predicts continuous values",
        "B. Regression predicts categories",
        "C. Classification predicts discrete labels",
        "D. They are the same"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "38. What are common activation functions in neural networks? (Select THREE)",
      options: [
        "A. ReLU",
        "B. Sigmoid",
        "C. Linear",
        "D. Tanh"
      ],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "39. What is the purpose of Amazon VPC?",
      options: [
        "A. Object storage",
        "B. Virtual private cloud networking",
        "C. Database hosting",
        "D. Content delivery"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "40. What is the purpose of batch normalization?",
      options: [
        "A. To increase training time",
        "B. To normalize input data",
        "C. To stabilize and accelerate training",
        "D. To reduce model accuracy"
      ],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "41. Which AWS services support container orchestration? (Select TWO)",
      options: [
        "A. Amazon ECS",
        "B. Amazon EKS",
        "C. Amazon RDS",
        "D. Amazon S3"
      ],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "42. What is the purpose of attention mechanism in transformers?",
      options: [
        "A. To reduce model size",
        "B. To focus on relevant parts of input",
        "C. To speed up inference",
        "D. To generate random outputs"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "43. What are common evaluation metrics for regression? (Select TWO)",
      options: [
        "A. Mean Squared Error",
        "B. Accuracy",
        "C. R-squared",
        "D. F1 Score"
      ],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "44. What is the purpose of Amazon DynamoDB?",
      options: [
        "A. Relational database",
        "B. NoSQL database",
        "C. Object storage",
        "D. Message queue"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "45. What is data augmentation used for?",
      options: [
        "A. To reduce dataset size",
        "B. To increase training data diversity",
        "C. To clean data",
        "D. To compress data"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "46. Which AWS services support machine learning model deployment? (Select TWO)",
      options: [
        "A. Amazon SageMaker",
        "B. AWS Lambda",
        "C. Amazon EC2",
        "D. Amazon S3"
      ],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "47. What is the purpose of word embeddings in NLP?",
      options: [
        "A. To count word frequency",
        "B. To represent words as dense vectors",
        "C. To remove stop words",
        "D. To tokenize text"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "48. What are common deep learning frameworks? (Select THREE)",
      options: [
        "A. TensorFlow",
        "B. PyTorch",
        "C. NumPy",
        "D. Keras"
      ],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "49. What is the purpose of Amazon CloudWatch?",
      options: [
        "A. Object storage",
        "B. Monitoring and logging",
        "C. Database hosting",
        "D. Content delivery"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "50. What is the main purpose of model ensembling?",
      options: [
        "A. To reduce model size",
        "B. To improve prediction accuracy",
        "C. To speed up training",
        "D. To simplify deployment"
      ],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "51. What is the purpose of a validation set in machine learning?",
      options: ["A. To train the model", "B. To tune hyperparameters", "C. To test final performance", "D. To preprocess data"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "52. Which AWS services can be used for real-time analytics? (Select TWO)",
      options: ["A. Amazon Kinesis", "B. Amazon Redshift", "C. Amazon Athena", "D. AWS Glue"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "53. What is the main purpose of a convolutional neural network (CNN)?",
      options: ["A. Text processing", "B. Image recognition", "C. Time series analysis", "D. Recommendation systems"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "54. What are common types of neural network layers? (Select THREE)",
      options: ["A. Dense layer", "B. Convolutional layer", "C. Storage layer", "D. Recurrent layer"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "55. What is the purpose of Amazon RDS?",
      options: ["A. NoSQL database", "B. Managed relational database", "C. Data warehouse", "D. Cache service"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "56. What is the difference between precision and recall?",
      options: ["A. They are the same metric", "B. Precision is about positive predictions, recall is about capturing actual positives", "C. Precision is for regression, recall is for classification", "D. They both measure accuracy"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "57. Which AWS services support serverless computing? (Select TWO)",
      options: ["A. AWS Lambda", "B. Amazon EC2", "C. AWS Fargate", "D. Amazon EBS"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "58. What is the purpose of a recurrent neural network (RNN)?",
      options: ["A. Image classification", "B. Processing sequential data", "C. Dimensionality reduction", "D. Clustering"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "59. What are advantages of cloud computing? (Select THREE)",
      options: ["A. Scalability", "B. Cost-effectiveness", "C. Unlimited resources", "D. High availability"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "60. What is the purpose of feature scaling in machine learning?",
      options: ["A. To increase model complexity", "B. To normalize feature ranges", "C. To reduce training time", "D. To prevent overfitting"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "61. What is the main purpose of Amazon EMR?",
      options: ["A. Email service", "B. Big data processing", "C. Mobile app backend", "D. Content management"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "62. Which techniques are used for handling imbalanced datasets? (Select TWO)",
      options: ["A. Oversampling", "B. Adding more features", "C. Undersampling", "D. Feature selection"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "63. What is the purpose of a learning rate in gradient descent?",
      options: ["A. To determine the number of iterations", "B. To control step size during optimization", "C. To select features", "D. To initialize weights"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "64. What are common AWS storage services? (Select THREE)",
      options: ["A. Amazon S3", "B. Amazon EBS", "C. Amazon RDS", "D. Amazon EFS"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "65. What is the purpose of dropout in neural networks?",
      options: ["A. To increase training speed", "B. To prevent overfitting", "C. To initialize weights", "D. To normalize data"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "66. What is the difference between batch gradient descent and stochastic gradient descent?",
      options: ["A. They are the same algorithm", "B. Batch uses all data, stochastic uses one sample at a time", "C. Batch is faster than stochastic", "D. Stochastic cannot converge"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "67. Which AWS services support analytics workloads? (Select TWO)",
      options: ["A. Amazon Redshift", "B. Amazon S3", "C. Amazon Athena", "D. Amazon VPC"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "68. What is the purpose of Amazon SageMaker?",
      options: ["A. Email marketing", "B. Machine learning platform", "C. Content delivery", "D. Database management"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "69. What are key components of MLOps? (Select THREE)",
      options: ["A. Model training", "B. Model deployment", "C. Model deletion only", "D. Model monitoring"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "70. What is the purpose of feature selection?",
      options: ["A. To increase model complexity", "B. To identify most relevant features", "C. To normalize data", "D. To generate new features"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "71. What is the main purpose of AWS Direct Connect?",
      options: ["A. Content delivery", "B. Dedicated network connection", "C. Database access", "D. Email service"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "72. Which techniques help with model interpretability? (Select TWO)",
      options: ["A. SHAP values", "B. Black box models", "C. LIME", "D. Deep learning only"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "73. What is the purpose of a decision tree?",
      options: ["A. To cluster data", "B. To make predictions based on rules", "C. To reduce dimensions", "D. To generate embeddings"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "74. What are advantages of decision trees? (Select THREE)",
      options: ["A. Easy to interpret", "B. Can handle categorical data", "C. Always more accurate than neural networks", "D. Require less data preprocessing"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "75. What is the purpose of Amazon SNS?",
      options: ["A. Simple notification service", "B. Data storage", "C. Compute service", "D. Networking"],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "76. What is the difference between bagging and boosting?",
      options: ["A. They are the same technique", "B. Bagging trains in parallel, boosting trains sequentially", "C. Boosting cannot reduce variance", "D. Bagging always performs better"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "77. Which AWS services are used for CI/CD? (Select TWO)",
      options: ["A. AWS CodePipeline", "B. AWS CodeBuild", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "78. What is the purpose of random forest?",
      options: ["A. To use single decision tree", "B. To ensemble multiple decision trees", "C. To reduce feature dimensions", "D. To cluster data"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "79. What are common hyperparameter tuning methods? (Select THREE)",
      options: ["A. Grid search", "B. Random search", "C. Manual tuning only", "D. Bayesian optimization"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "80. What is the purpose of Amazon Route 53?",
      options: ["A. DNS service", "B. Content delivery", "C. Database service", "D. Compute service"],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "81. What is the purpose of principal component analysis (PCA)?",
      options: ["A. Classification", "B. Dimensionality reduction", "C. Clustering", "D. Regression"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "82. Which AWS services support hybrid cloud deployments? (Select TWO)",
      options: ["A. AWS Outposts", "B. Amazon S3", "C. AWS Storage Gateway", "D. Amazon EC2"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "83. What is the purpose of a support vector machine (SVM)?",
      options: ["A. To find optimal hyperplane", "B. To cluster data", "C. To reduce dimensions", "D. To generate text"],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "84. What are characteristics of good features? (Select THREE)",
      options: ["A. Informative", "B. Independent", "C. Always numeric", "D. Relevant to the task"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "85. What is the purpose of AWS Elastic Beanstalk?",
      options: ["A. Container orchestration", "B. Platform as a service", "C. Database management", "D. DNS service"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "86. What is the difference between L1 and L2 regularization?",
      options: ["A. They are the same", "B. L1 promotes sparsity, L2 promotes small weights", "C. L2 is faster than L1", "D. L1 cannot be used with neural networks"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "87. Which AWS services support encryption at rest? (Select TWO)",
      options: ["A. Amazon S3", "B. Amazon EBS", "C. Amazon SNS", "D. Amazon SQS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "88. What is the purpose of cross-entropy loss?",
      options: ["A. Regression problems", "B. Classification problems", "C. Clustering problems", "D. Dimensionality reduction"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "89. What are common data augmentation techniques for images? (Select THREE)",
      options: ["A. Random cropping", "B. Color jittering", "C. Using original only", "D. Random flipping"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "90. What is the purpose of Amazon ElastiCache?",
      options: ["A. In-memory caching", "B. Object storage", "C. Database service", "D. Email service"],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "91. What is the purpose of K-fold cross-validation?",
      options: ["A. To increase training data", "B. To get more reliable performance estimates", "C. To reduce model complexity", "D. To speed up training"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "92. Which AWS services are serverless databases? (Select TWO)",
      options: ["A. Amazon DynamoDB", "B. Amazon Aurora Serverless", "C. Amazon EC2", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "93. What is the purpose of a generative adversarial network (GAN)?",
      options: ["A. Classification", "B. Generating new data", "C. Clustering", "D. Dimensionality reduction"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "94. What are common loss functions for regression? (Select THREE)",
      options: ["A. Mean Squared Error", "B. Mean Absolute Error", "C. Cross-entropy", "D. Huber Loss"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "95. What is the purpose of AWS Step Functions?",
      options: ["A. State machine orchestration", "B. Data storage", "C. Content delivery", "D. Email service"],
      answer: "答案:A",
      is_multiple: false
    },
    {
      question: "96. What is the difference between bias and variance?",
      options: ["A. They are the same concept", "B. Bias is error from wrong assumptions, variance is error from sensitivity to data", "C. High variance is always good", "D. Bias cannot be reduced"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "97. Which AWS services support IoT workloads? (Select TWO)",
      options: ["A. AWS IoT Core", "B. Amazon S3", "C. AWS IoT Greengrass", "D. Amazon RDS"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "98. What is the purpose of model serialization?",
      options: ["A. To increase model accuracy", "B. To save and load trained models", "C. To preprocess data", "D. To select features"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "99. What are benefits of using pre-trained models? (Select THREE)",
      options: ["A. Faster training", "B. Better performance with less data", "C. Always requires more data", "D. Reduced computational cost"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "100. What is the purpose of Amazon CodeGuru?",
      options: ["A. Code review automation", "B. Application performance monitoring", "C. Both A and B", "D. Data storage"],
      answer: "答案:C",
      is_multiple: false
    },
    {
      question: "101. What is the purpose of the sigmoid activation function?",
      options: ["A. To normalize data", "B. To map values to 0-1 range", "C. To reduce dimensions", "D. To cluster data"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "102. Which AWS services support data transfer? (Select TWO)",
      options: ["A. AWS Snowball", "B. AWS DataSync", "C. Amazon S3", "D. Amazon SNS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "103. What is the purpose of a long short-term memory (LSTM) network?",
      options: ["A. Image classification", "B. Handling long-term dependencies in sequences", "C. Dimensionality reduction", "D. Clustering"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "104. What are common clustering algorithms? (Select THREE)",
      options: ["A. K-Means", "B. DBSCAN", "C. Linear Regression", "D. Hierarchical clustering"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "105. What is the purpose of Amazon Personalize?",
      options: ["A. Email service", "B. Personalization and recommendations", "C. Database management", "D. Content delivery"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "106. What is the purpose of early stopping?",
      options: ["A. To start training faster", "B. To prevent overfitting by stopping when validation loss increases", "C. To reduce training data", "D. To select features"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "107. Which AWS services support API management? (Select TWO)",
      options: ["A. Amazon API Gateway", "B. AWS Lambda", "C. AWS AppSync", "D. Amazon S3"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "108. What is the purpose of data normalization?",
      options: ["A. To increase data size", "B. To scale data to a standard range", "C. To remove outliers", "D. To generate new features"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "109. What are characteristics of serverless computing? (Select THREE)",
      options: ["A. No server management", "B. Pay-per-use pricing", "C. Always running servers", "D. Auto-scaling"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "110. What is the purpose of Amazon Textract?",
      options: ["A. Text translation", "B. Document text extraction", "C. Text-to-speech", "D. Speech recognition"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "111. What is the purpose of weight initialization in neural networks?",
      options: ["A. To speed up convergence", "B. To set starting values for weights", "C. To reduce training time", "D. To prevent overfitting"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "112. Which AWS services support security and compliance? (Select TWO)",
      options: ["A. AWS IAM", "B. Amazon Cognito", "C. Amazon S3", "D. Amazon SNS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "113. What is the purpose of max pooling in CNNs?",
      options: ["A. To increase feature maps", "B. To reduce spatial dimensions", "C. To normalize data", "D. To add new features"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "114. What are common techniques for handling missing values? (Select THREE)",
      options: ["A. Mean/median imputation", "B. Deleting rows with missing values", "C. Using missing values as features", "D. Always deleting the column"],
      answer: "答案:A,B,C",
      is_multiple: true
    },
    {
      question: "115. What is the purpose of Amazon Comprehend?",
      options: ["A. Text-to-speech", "B. Natural language processing", "C. Image recognition", "D. Speech recognition"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "116. What is the difference between parameter and hyperparameter?",
      options: ["A. They are the same", "B. Parameters are learned, hyperparameters are set before training", "C. Hyperparameters are learned during training", "D. Parameters are always fixed"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "117. Which AWS services support machine learning inference? (Select TWO)",
      options: ["A. Amazon SageMaker", "B. AWS Lambda", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "118. What is the purpose of the softmax function?",
      options: ["A. To normalize single values", "B. To convert outputs to probability distribution", "C. To reduce dimensions", "D. To cluster data"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "119. What are common evaluation metrics for multi-class classification? (Select THREE)",
      options: ["A. Macro-averaged F1", "B. Micro-averaged F1", "C. Mean Squared Error", "D. Confusion matrix"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "120. What is the purpose of Amazon Rekognition?",
      options: ["A. Text analysis", "B. Image and video analysis", "C. Speech recognition", "D. Data storage"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "121. What is the purpose of batch size in training?",
      options: ["A. To determine model architecture", "B. To control number of samples per iteration", "C. To set learning rate", "D. To initialize weights"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "122. Which AWS services support event-driven architecture? (Select TWO)",
      options: ["A. Amazon EventBridge", "B. AWS Lambda", "C. Amazon RDS", "D. Amazon S3"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "123. What is the purpose of gradient clipping?",
      options: ["A. To speed up training", "B. To prevent exploding gradients", "C. To reduce model size", "D. To improve accuracy"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "124. What are common optimization algorithms? (Select THREE)",
      options: ["A. SGD", "B. Adam", "C. Linear Regression", "D. RMSprop"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "125. What is the purpose of Amazon Polly?",
      options: ["A. Speech recognition", "B. Text-to-speech", "C. Image analysis", "D. Data storage"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "126. What is the purpose of embedding layers in NLP?",
      options: ["A. To count words", "B. To convert words to dense vectors", "C. To remove stop words", "D. To tokenize text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "127. Which AWS services support data warehousing? (Select TWO)",
      options: ["A. Amazon Redshift", "B. Amazon RDS", "C. Amazon Athena", "D. Amazon DynamoDB"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "128. What is the purpose of attention mechanism?",
      options: ["A. To reduce model size", "B. To focus on relevant parts of input", "C. To speed up training", "D. To generate random outputs"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "129. What are common text preprocessing techniques? (Select THREE)",
      options: ["A. Tokenization", "B. Stop word removal", "C. Image augmentation", "D. Stemming/Lemmatization"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "130. What is the purpose of Amazon Transcribe?",
      options: ["A. Text-to-speech", "B. Speech-to-text", "C. Image analysis", "D. Translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "131. What is the purpose of residual connections in deep networks?",
      options: ["A. To increase model size", "B. To enable training of very deep networks", "C. To reduce training data", "D. To simplify architecture"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "132. Which AWS services support machine learning model training? (Select TWO)",
      options: ["A. Amazon SageMaker", "B. Amazon EC2", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "133. What is the purpose of the encoder-decoder architecture?",
      options: ["A. Classification only", "B. Sequence-to-sequence tasks", "C. Clustering", "D. Dimensionality reduction"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "134. What are common applications of computer vision? (Select THREE)",
      options: ["A. Object detection", "B. Image classification", "C. Text translation", "D. Image segmentation"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "135. What is the purpose of Amazon Translate?",
      options: ["A. Speech recognition", "B. Language translation", "C. Image analysis", "D. Data storage"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "136. What is the purpose of the vanishing gradient problem?",
      options: ["A. To speed up training", "B. To make training difficult in deep networks", "C. To improve accuracy", "D. To reduce model size"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "137. Which AWS services support data cataloging? (Select TWO)",
      options: ["A. AWS Glue", "B. Amazon S3", "C. AWS Lake Formation", "D. Amazon RDS"],
      answer: "答案:A,C",
      is_multiple: true
    },
    {
      question: "138. What is the purpose of beam search in sequence generation?",
      options: ["A. To speed up training", "B. To find better sequences by exploring multiple paths", "C. To reduce model size", "D. To prevent overfitting"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "139. What are common sequence-to-sequence applications? (Select THREE)",
      options: ["A. Machine translation", "B. Text summarization", "C. Image classification", "D. Question answering"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "140. What is the purpose of Amazon Lex?",
      options: ["A. Text analysis", "B. Chatbot building", "C. Image recognition", "D. Data storage"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "141. What is the purpose of tokenization in NLP?",
      options: ["A. To remove words", "B. To split text into tokens", "C. To generate text", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "142. Which AWS services support data transformation? (Select TWO)",
      options: ["A. AWS Glue", "B. AWS Lambda", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "143. What is the purpose of named entity recognition (NER)?",
      options: ["A. To classify text", "B. To identify and classify named entities in text", "C. To translate text", "D. To generate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "144. What are common sentiment analysis approaches? (Select THREE)",
      options: ["A. Rule-based", "B. Machine learning-based", "C. Image processing", "D. Hybrid approaches"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "145. What is the purpose of Amazon Kendra?",
      options: ["A. Text translation", "B. Enterprise search", "C. Image analysis", "D. Speech recognition"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "146. What is the purpose of part-of-speech tagging?",
      options: ["A. To remove words", "B. To identify grammatical roles of words", "C. To translate text", "D. To generate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "147. Which AWS services support data backup? (Select TWO)",
      options: ["A. AWS Backup", "B. Amazon S3", "C. Amazon SNS", "D. Amazon SQS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "148. What is the purpose of word sense disambiguation?",
      options: ["A. To count words", "B. To determine the meaning of words in context", "C. To remove words", "D. To generate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "149. What are common text generation techniques? (Select THREE)",
      options: ["A. Language models", "B. Template-based generation", "C. Image processing", "D. Neural network-based generation"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "150. What is the purpose of Amazon Connect?",
      options: ["A. Data storage", "B. Contact center service", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "151. What is the purpose of coreference resolution?",
      options: ["A. To count words", "B. To identify when expressions refer to the same entity", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "152. Which AWS services support data streaming? (Select TWO)",
      options: ["A. Amazon Kinesis", "B. Amazon MSK", "C. Amazon RDS", "D. Amazon S3"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "153. What is the purpose of dependency parsing?",
      options: ["A. To count words", "B. To analyze grammatical structure", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "154. What are common speech recognition challenges? (Select THREE)",
      options: ["A. Accent variations", "B. Background noise", "C. Image quality", "D. Multiple speakers"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "155. What is the purpose of Amazon Chime?",
      options: ["A. Data storage", "B. Communication and collaboration", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "156. What is the purpose of semantic role labeling?",
      options: ["A. To count words", "B. To identify roles of words in sentences", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "157. Which AWS services support workflow automation? (Select TWO)",
      options: ["A. AWS Step Functions", "B. Amazon SWF", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "158. What is the purpose of text summarization?",
      options: ["A. To expand text", "B. To create shorter versions of text", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "159. What are common machine translation approaches? (Select THREE)",
      options: ["A. Rule-based", "B. Statistical", "C. Image processing", "D. Neural machine translation"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "160. What is the purpose of Amazon WorkSpaces?",
      options: ["A. Data storage", "B. Virtual desktops", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "161. What is the purpose of relation extraction?",
      options: ["A. To count words", "B. To identify relationships between entities", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "162. Which AWS services support data governance? (Select TWO)",
      options: ["A. AWS Lake Formation", "B. AWS Glue", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "163. What is the purpose of topic modeling?",
      options: ["A. To classify text", "B. To discover abstract topics in documents", "C. To translate text", "D. To generate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "164. What are common information extraction tasks? (Select THREE)",
      options: ["A. Named entity recognition", "B. Relation extraction", "C. Image classification", "D. Event extraction"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "165. What is the purpose of Amazon QuickSight?",
      options: ["A. Text translation", "B. Business intelligence and analytics", "C. Image analysis", "D. Speech recognition"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "166. What is the purpose of text classification?",
      options: ["A. To generate text", "B. To categorize text into predefined classes", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "167. Which AWS services support data visualization? (Select TWO)",
      options: ["A. Amazon QuickSight", "B. Amazon Athena", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "168. What is the purpose of language modeling?",
      options: ["A. To count words", "B. To predict probability of word sequences", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "169. What are common dialogue system components? (Select THREE)",
      options: ["A. Natural language understanding", "B. Dialogue management", "C. Image processing", "D. Natural language generation"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "170. What is the purpose of Amazon FSx?",
      options: ["A. Data storage", "B. File storage service", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "171. What is the purpose of question answering systems?",
      options: ["A. To generate questions", "B. To provide answers to natural language questions", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "172. Which AWS services support data migration? (Select TWO)",
      options: ["A. AWS DMS", "B. AWS Snowball", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "173. What is the purpose of machine reading comprehension?",
      options: ["A. To count words", "B. To understand and answer questions about text", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "174. What are common knowledge graph applications? (Select THREE)",
      options: ["A. Search engines", "B. Recommendation systems", "C. Image classification", "D. Question answering"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "175. What is the purpose of Amazon EKS?",
      options: ["A. Data storage", "B. Kubernetes service", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "176. What is the purpose of text entailment?",
      options: ["A. To generate text", "B. To determine if one text implies another", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "177. Which AWS services support data archiving? (Select TWO)",
      options: ["A. Amazon S3 Glacier", "B. Amazon S3", "C. Amazon RDS", "D. Amazon SNS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "178. What is the purpose of paraphrase detection?",
      options: ["A. To count words", "B. To identify texts with same meaning", "C. To remove words", "D. To translate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "179. What are common text similarity measures? (Select THREE)",
      options: ["A. Cosine similarity", "B. Jaccard similarity", "C. Image similarity", "D. Edit distance"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "180. What is the purpose of Amazon ECS?",
      options: ["A. Data storage", "B. Container orchestration", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "181. What is the purpose of text generation?",
      options: ["A. To remove text", "B. To create new text content", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "182. Which AWS services support data processing? (Select TWO)",
      options: ["A. AWS Glue", "B. Amazon EMR", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "183. What is the purpose of text clustering?",
      options: ["A. To classify text", "B. To group similar documents together", "C. To translate text", "D. To generate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "184. What are common text representation methods? (Select THREE)",
      options: ["A. Bag of words", "B. TF-IDF", "C. Image features", "D. Word embeddings"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "185. What is the purpose of Amazon Lightsail?",
      options: ["A. Data storage", "B. Virtual private servers", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "186. What is the purpose of keyword extraction?",
      options: ["A. To generate keywords", "B. To identify important terms in text", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "187. Which AWS services support data integration? (Select TWO)",
      options: ["A. AWS Glue", "B. Amazon AppFlow", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "188. What is the purpose of text segmentation?",
      options: ["A. To remove text", "B. To divide text into meaningful units", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "189. What are common text annotation tasks? (Select THREE)",
      options: ["A. Named entity annotation", "B. Sentiment annotation", "C. Image annotation", "D. Part-of-speech annotation"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "190. What is the purpose of AWS Batch?",
      options: ["A. Data storage", "B. Batch computing", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "191. What is the purpose of spell checking in NLP?",
      options: ["A. To generate text", "B. To identify and correct spelling errors", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "192. Which AWS services support data quality? (Select TWO)",
      options: ["A. AWS Glue DataBrew", "B. Amazon Deequ", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "193. What is the purpose of language detection?",
      options: ["A. To translate text", "B. To identify the language of text", "C. To remove words", "D. To generate text"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "194. What are common text preprocessing pipelines? (Select THREE)",
      options: ["A. Tokenization", "B. Normalization", "C. Image processing", "D. Stop word removal"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "195. What is the purpose of AWS Amplify?",
      options: ["A. Data storage", "B. Full-stack application development", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "196. What is the purpose of text normalization?",
      options: ["A. To expand text", "B. To standardize text format", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "197. Which AWS services support data discovery? (Select TWO)",
      options: ["A. AWS Glue", "B. Amazon Athena", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "198. What is the purpose of text deduplication?",
      options: ["A. To generate text", "B. To remove duplicate content", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "199. What are common text data sources? (Select THREE)",
      options: ["A. Social media", "B. News articles", "C. Image files", "D. Customer reviews"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "200. What is the purpose of AWS App Runner?",
      options: ["A. Data storage", "B. Container deployment", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "201. What is the purpose of text indexing?",
      options: ["A. To remove text", "B. To enable efficient text search", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "202. Which AWS services support data security? (Select TWO)",
      options: ["A. AWS KMS", "B. AWS Secrets Manager", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "203. What is the purpose of text retrieval?",
      options: ["A. To generate text", "B. To find relevant documents", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "204. What are common text analysis libraries? (Select THREE)",
      options: ["A. NLTK", "B. spaCy", "C. TensorFlow", "D. Transformers"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "205. What is the purpose of AWS Cloud9?",
      options: ["A. Data storage", "B. Cloud IDE", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "206. What is the purpose of text compression?",
      options: ["A. To expand text", "B. To reduce text size", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "207. Which AWS services support data monitoring? (Select TWO)",
      options: ["A. Amazon CloudWatch", "B. AWS CloudTrail", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "208. What is the purpose of text encryption?",
      options: ["A. To generate text", "B. To secure text content", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "209. What are common text file formats? (Select THREE)",
      options: ["A. TXT", "B. CSV", "C. PNG", "D. JSON"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "210. What is the purpose of AWS X-Ray?",
      options: ["A. Data storage", "B. Application tracing", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "211. What is the purpose of text validation?",
      options: ["A. To generate text", "B. To verify text correctness", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "212. Which AWS services support data orchestration? (Select TWO)",
      options: ["A. AWS Step Functions", "B. Amazon MWAA", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "213. What is the purpose of text transformation?",
      options: ["A. To remove text", "B. To convert text between formats", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "214. What are common text encoding methods? (Select THREE)",
      options: ["A. UTF-8", "B. ASCII", "C. Binary", "D. UTF-16"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "215. What is the purpose of AWS Systems Manager?",
      options: ["A. Data storage", "B. Operations management", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "216. What is the purpose of text parsing?",
      options: ["A. To generate text", "B. To analyze text structure", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "217. Which AWS services support data cataloging? (Select TWO)",
      options: ["A. AWS Glue Data Catalog", "B. Amazon Athena", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "218. What is the purpose of text formatting?",
      options: ["A. To remove text", "B. To structure text appearance", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "219. What are common text processing challenges? (Select THREE)",
      options: ["A. Ambiguity", "B. Context understanding", "C. Image quality", "D. Language variations"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "220. What is the purpose of AWS Config?",
      options: ["A. Data storage", "B. Configuration management", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "221. What is the purpose of text mining?",
      options: ["A. To generate text", "B. To extract insights from text", "C. To translate text", "D. To remove words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "222. Which AWS services support data analytics? (Select TWO)",
      options: ["A. Amazon Redshift", "B. Amazon Athena", "C. Amazon S3", "D. Amazon RDS"],
      answer: "答案:A,B",
      is_multiple: true
    },
    {
      question: "223. What is the purpose of text cleaning?",
      options: ["A. To add text", "B. To remove noise from text", "C. To translate text", "D. To count words"],
      answer: "答案:B",
      is_multiple: false
    },
    {
      question: "224. What are common text quality metrics? (Select THREE)",
      options: ["A. Completeness", "B. Accuracy", "C. Image resolution", "D. Consistency"],
      answer: "答案:A,B,D",
      is_multiple: true
    },
    {
      question: "225. What is the purpose of AWS Service Catalog?",
      options: ["A. Data storage", "B. Service management", "C. Image analysis", "D. Text translation"],
      answer: "答案:B",
      is_multiple: false
    }
  ];
}

// 读取PDF文件或使用模拟数据
async function loadPDF() {
  const pdfPath = path.join(__dirname, '..', 'data', 'AIF-C01 Exam Q&A(224)-1.pdf');
  const xmlPath = path.join(__dirname, '..', 'data', 'pdf_parsed.xml');
  console.log(`PDF文件路径: ${pdfPath}`);
  console.log(`XML文件路径: ${xmlPath}`);
  console.log(`PDF文件是否存在: ${fs.existsSync(pdfPath)}`);
  console.log(`XML文件是否存在: ${fs.existsSync(xmlPath)}`);
  
  try {
    // 优先从XML文件读取
    if (fs.existsSync(xmlPath)) {
      console.log('从XML文件读取问题和答案');
      const questionsFromXML = await parseQuestionsFromXML();
      if (questionsFromXML.length > 0) {
        console.log(`从XML解析出 ${questionsFromXML.length} 个问题`);
        return questionsFromXML;
      }
    }
    
    // 如果XML文件不存在或解析失败，回退到PDF解析
    if (fs.existsSync(pdfPath)) {
      // 生成XML格式的PDF解析结果
      await parsePDFToXML();
      
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
    const pick = parseInt(req.query.pick) || 10;
    const shuffle = req.query.shuffle === 'true';
    const startIndex = req.query.startIndex ? parseInt(req.query.startIndex) : null;
    const endIndex = req.query.endIndex ? parseInt(req.query.endIndex) : null;
    
    console.log(`请求题目数量: ${pick}, 打乱答案: ${shuffle}, 起始索引: ${startIndex}, 结束索引: ${endIndex}`);
    
    const questions = await loadPDF();
    console.log(`解析出 ${questions.length} 个问题`);
    
    let filteredQuestions = questions;
    if (startIndex !== null || endIndex !== null) {
      const start = startIndex !== null ? Math.max(0, startIndex - 1) : 0;
      const end = endIndex !== null ? Math.min(questions.length, endIndex) : questions.length;
      filteredQuestions = questions.slice(start, end);
      console.log(`过滤后的题目范围: ${start + 1} - ${end}, 数量: ${filteredQuestions.length}`);
    }
    
    const quiz = generateQuiz(filteredQuestions, pick, shuffle);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://192.168.3.119:${PORT}`);
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

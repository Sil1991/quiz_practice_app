// 测试formatQuestionText方法
function formatQuestionText(text) {
  // 处理XML高亮标签，转换为HTML
  if (text) {
    console.log('原始文本:', text);
    // 将highlight标签转换为带有样式的span标签
    const result = text.replace(/<highlight[^>]*>(.*?)<\/highlight>/g, '<span class="highlight">$1</span>');
    console.log('处理后文本:', result);
    return result;
  }
  return text;
}

// 测试用例
const testText = "25.A company wants to use a large language model   （ <highlight color=\"rgb(124,200,104)\">LLM</highlight> ）   on Amazon Bedrock for sentiment analysis.";
console.log('测试结果:', formatQuestionText(testText));

// 测试选项中的highlight标签
const testOption = "B.Provide a detailed explanation of sentiment analysis and how <highlight color=\"rgb(124,200,104)\">LLM</highlight>s work in the prompt.";
console.log('测试选项结果:', formatQuestionText(testOption));

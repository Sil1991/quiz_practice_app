<template>
  <div class="app">
    <div class="container">
      <h1 class="title">AIF-C01 问答测试</h1>
      
      <div v-if="loading" class="loading">
        <p>加载中...</p>
      </div>
      
      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="loadQuestions">重试</button>
      </div>
      
      <div v-else-if="showResult" class="result">
        <h2>测试完成！</h2>
        <p>正确答案: {{ score }} / {{ selectedQuiz.length }}</p>
        <p>得分: {{ percentage.toFixed(1) }}%</p>
        <button @click="restartQuiz">重新开始</button>
      </div>
      
      <div v-else class="quiz">
        <div class="progress">
          <p class="progress-text">第 {{ currentQuestionIndex + 1 }} / {{ selectedQuiz.length }} 题</p>
          <p class="question-type" :class="{ multiple: currentQuestion.is_multiple }">
            {{ currentQuestion.is_multiple ? '【多选题】' : '【单选题】' }}
          </p>
        </div>
        
        <div class="question">
          <h3>问题：</h3>
          <p>{{ currentQuestion.question }}</p>
        </div>
        
        <div class="options">
          <h3>选项：</h3>
          
          <!-- 单选题 -->
          <div v-if="!currentQuestion.is_multiple" class="option-buttons">
            <button
              v-for="(option, index) in currentQuestion.options"
              :key="index"
              :class="{
                'option-button': true,
                'correct': answered && correctLetters.includes(option[0]),
                'incorrect': answered && selectedIndex === index && !correctLetters.includes(option[0]),
                'disabled': answered
              }"
              :disabled="answered"
              @click="onOptionClick(index)"
            >
              {{ option }}
            </button>
          </div>
          
          <!-- 多选题 -->
          <div v-else class="option-checkboxes">
            <div
              v-for="(option, index) in currentQuestion.options"
              :key="index"
              class="checkbox-item"
            >
              <input
                type="checkbox"
                :id="`option-${index}`"
                :checked="selectedIndices.includes(index)"
                :disabled="answered"
                @change="onCheckboxChange(index)"
              />
              <label
                :for="`option-${index}`"
                :class="{
                  'correct': answered && correctLetters.includes(option[0]),
                  'incorrect': answered && selectedIndices.includes(index) && !correctLetters.includes(option[0])
                }"
              >
                {{ option }}
              </label>
            </div>
            <button
              v-if="!answered"
              class="submit-button"
              @click="onSubmitClick"
            >
              提交答案
            </button>
          </div>
        </div>
        
        <div class="feedback" v-if="answered">
          <h3>结果：</h3>
          <p :class="{ correct: isCorrect, incorrect: !isCorrect }">
            {{ feedback }}
          </p>
        </div>
        
        <div class="buttons">
          <button
            class="next-button"
            :disabled="!answered"
            @click="onNextClick"
          >
            下一题
          </button>
          <button class="restart-button" @click="restartQuiz">
            重新开始
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'App',
  data() {
    return {
      questions: [],
      selectedQuiz: [],
      currentQuestionIndex: 0,
      score: 0,
      loading: true,
      error: null,
      showResult: false,
      answered: false,
      isCorrect: false,
      feedback: '',
      selectedIndex: -1,
      selectedIndices: [],
      correctLetters: []
    };
  },
  computed: {
    currentQuestion() {
      return this.selectedQuiz[this.currentQuestionIndex] || {};
    },
    percentage() {
      if (this.selectedQuiz.length === 0) return 0;
      return (this.score / this.selectedQuiz.length) * 100;
    }
  },
  created() {
    this.loadQuestions();
    // 监听键盘事件
    window.addEventListener('keydown', this.onKeyDown);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeyDown);
  },
  methods: {
    async loadQuestions() {
      this.loading = true;
      this.error = null;
      try {
        console.log('开始加载问题...');
        const response = await axios.get('http://localhost:3001/api/questions');
        console.log('API响应:', response.data);
        this.questions = response.data;
        console.log('问题数量:', this.questions.length);
        this.startQuiz();
      } catch (error) {
        console.error('加载问题失败:', error);
        this.error = `加载问题失败: ${error.message}`;
      } finally {
        this.loading = false;
      }
    },
    startQuiz() {
      this.selectedQuiz = this.questions;
      this.currentQuestionIndex = 0;
      this.score = 0;
      this.showResult = false;
      this.resetQuestion();
    },
    resetQuestion() {
      this.answered = false;
      this.isCorrect = false;
      this.feedback = '';
      this.selectedIndex = -1;
      this.selectedIndices = [];
      this.correctLetters = [];
    },
    onOptionClick(index) {
      if (this.answered) return;
      
      this.selectedIndex = index;
      const option = this.currentQuestion.options[index];
      const selectedLetter = option[0].toUpperCase();
      
      this.checkAnswer([selectedLetter], false);
    },
    onCheckboxChange(index) {
      if (this.answered) return;
      
      if (this.selectedIndices.includes(index)) {
        this.selectedIndices = this.selectedIndices.filter(i => i !== index);
      } else {
        this.selectedIndices.push(index);
      }
    },
    onSubmitClick() {
      if (this.answered) return;
      
      if (this.selectedIndices.length === 0) {
        alert('请至少选择一个答案！');
        return;
      }
      
      const selectedLetters = this.selectedIndices.map(index => {
        return this.currentQuestion.options[index][0].toUpperCase();
      });
      
      this.checkAnswer(selectedLetters, true);
    },
    async checkAnswer(selectedLetters, isMultiple) {
      try {
        const response = await axios.post('http://localhost:3001/api/check-answer', {
          question: this.currentQuestion,
          selected: selectedLetters,
          isMultiple
        });
        
        const { isCorrect, correctLetters } = response.data;
        this.isCorrect = isCorrect;
        this.correctLetters = correctLetters;
        
        if (isCorrect) {
          this.score++;
          this.feedback = '✓ 回答正确！';
        } else {
          this.feedback = `✗ 回答错误！\n正确答案：${correctLetters.sort().join(', ')}`;
        }
        
        this.answered = true;
      } catch (error) {
        console.error('检查答案失败:', error);
      }
    },
    onNextClick() {
      this.currentQuestionIndex++;
      if (this.currentQuestionIndex >= this.selectedQuiz.length) {
        this.showResult = true;
      } else {
        this.resetQuestion();
      }
    },
    restartQuiz() {
      this.startQuiz();
    },
    onKeyDown(event) {
      if (event.key === ' ' || event.key === 'Enter') {
        if (this.answered && this.currentQuestionIndex < this.selectedQuiz.length) {
          this.onNextClick();
        }
      }
    }
  }
};
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  background-color: #f5f5f5;
}

.container {
  max-width: 1000px;
  width: 100%;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 30px;
  margin-top: 20px;
}

.title {
  text-align: center;
  color: #333;
  margin-bottom: 20px;
  font-size: 28px;
}

.loading, .error {
  text-align: center;
  padding: 50px 0;
}

.error button {
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e0e0e0;
}

.question-type {
  font-weight: bold;
  color: #2196f3;
}

.question-type.multiple {
  color: #ff9800;
}

.question {
  margin-bottom: 30px;
}

.question h3 {
  margin-bottom: 10px;
  color: #333;
}

.question p {
  font-size: 16px;
  line-height: 1.5;
  color: #555;
}

.options {
  margin-bottom: 30px;
}

.options h3 {
  margin-bottom: 15px;
  color: #333;
}

.option-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-button {
  padding: 15px 20px;
  text-align: left;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: #f5f5f5;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  line-height: 1.6;
  white-space: normal;
  word-wrap: break-word;
  min-height: 60px;
}

.option-button:hover {
  background-color: #e0e0e0;
}

.option-button:disabled {
  cursor: not-allowed;
}

.option-button.correct {
  background-color: #4caf50;
  color: black;
  border-color: #4caf50;
}

.option-button.incorrect {
  background-color: #f44336;
  color: black;
  border-color: #f44336;
}

.option-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.checkbox-item:hover {
  background-color: #f5f5f5;
}

.checkbox-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.checkbox-item label {
  flex: 1;
  cursor: pointer;
  font-size: 14px;
  line-height: 1.6;
  color: #555;
  white-space: normal;
  word-wrap: break-word;
  min-height: 40px;
}

.checkbox-item label.correct {
  color: #4caf50;
  font-weight: bold;
}

.checkbox-item label.incorrect {
  color: #f44336;
  font-weight: bold;
}

.submit-button {
  margin-top: 20px;
  padding: 12px 24px;
  background-color: #ff9800;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  align-self: flex-start;
}

.feedback {
  margin-bottom: 30px;
  padding: 20px;
  background-color: #f9f9f9;
  border-radius: 4px;
  border-left: 4px solid #2196f3;
}

.feedback h3 {
  margin-bottom: 10px;
  color: #333;
}

.feedback p {
  font-size: 16px;
  line-height: 1.5;
}

.feedback p.correct {
  color: #4caf50;
  font-weight: bold;
}

.feedback p.incorrect {
  color: #f44336;
  font-weight: bold;
}

.buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

.next-button, .restart-button {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.3s ease;
}

.next-button {
  background-color: #4caf50;
  color: white;
}

.next-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.restart-button {
  background-color: #2196f3;
  color: white;
}

.next-button:hover:not(:disabled), .restart-button:hover {
  opacity: 0.9;
}

.result {
  text-align: center;
  padding: 50px 0;
}

.result h2 {
  margin-bottom: 20px;
  color: #333;
}

.result p {
  margin-bottom: 10px;
  font-size: 18px;
  color: #555;
}

.result button {
  margin-top: 30px;
  padding: 12px 24px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

@media (max-width: 768px) {
  .container {
    padding: 20px;
  }
  
  .title {
    font-size: 24px;
  }
  
  .question p {
    font-size: 14px;
  }
  
  .option-button, .checkbox-item label {
    font-size: 13px;
  }
}
</style>

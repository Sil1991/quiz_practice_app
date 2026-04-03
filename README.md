# AIF-C01 问答测试应用

这是一个基于 Vue + NodeJS 的 AIF-C01 认证考试问答测试应用。该应用从 PDF 文件中提取问题和答案，随机生成测试题，支持单选题和多选题，并提供即时反馈。

## 项目结构

```
quiz-vue-node/
├── data/                 # 资料文件
│   └── AIF-C01 Exam Q&A(224)-1.pdf    # 问题PDF文件
├── backend/              # 后端服务
│   ├── package.json      # 后端依赖
│   ├── server.js         # 后端服务器
│   └── README.md         # 后端说明文档
├── frontend/             # 前端应用
│   ├── index.html        # 前端入口
│   ├── package.json      # 前端依赖
│   ├── vite.config.js    # Vite配置
│   ├── src/              # 前端源码
│   │   ├── main.js       # Vue应用入口
│   │   └── App.vue       # 主要组件
│   └── README.md         # 前端说明文档
└── README.md             # 项目说明文档
```

## 技术栈

### 后端
- NodeJS
- Express
- pdf-parse (PDF解析)
- cors (跨域支持)

### 前端
- Vue 3
- Vite
- Axios (API调用)
- CSS3 (响应式设计)

## 功能特性

- ✅ 从PDF文件中自动提取问题和答案
- ✅ 支持单选题和多选题
- ✅ 随机生成10道测试题
- ✅ 实时反馈答案正确性
- ✅ 支持键盘操作（空格/回车进入下一题）
- ✅ 响应式设计，适配不同屏幕尺寸
- ✅ 测试完成后显示得分和正确率

## 安装与运行

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 运行服务

```bash
# 启动后端服务
cd backend
npm start

# 启动前端服务
cd ../frontend
npm run dev
```

### 3. 终止服务

```bash
# 终止所有服务（Mac/Linux）
pkill -f "node server.js" && pkill -f "vite"
kill $(lsof -t -i :3001)
# 或者使用 Ctrl+C 手动终止每个终端的服务
```

### 3. 访问应用

- 前端应用：http://localhost:3000/
- 后端API：http://localhost:3001/api/questions

## API 接口

### GET /api/questions
- **功能**：获取随机10道测试题
- **响应**：包含问题、选项、答案和题型的JSON数组

### POST /api/check-answer
- **功能**：验证答案正确性
- **参数**：
  - `question`：问题对象
  - `selected`：选中的答案数组
  - `isMultiple`：是否为多选题
- **响应**：包含是否正确和正确答案的JSON对象

## 数据格式

### 问题对象

```json
{
  "question": "1.A company makes forecasts each quarter...",
  "options": [
    "A.Code for model training",
    "B.Partial dependence plots （PDPs）",
    "C.Sample data for training",
    "D.Model convergence tables"
  ],
  "answer": "答案:B",
  "is_multiple": false
}
```

## 常见问题

### 1. 后端服务启动失败
- 检查PDF文件是否存在于 `data` 目录
- 检查端口3001是否被占用

### 2. 前端显示问题为空
- 检查后端服务是否运行
- 检查网络连接
- 检查浏览器控制台是否有错误

### 3. PDF解析失败
- 确保PDF文件格式正确
- 确保PDF文件没有密码保护

## 扩展功能

- [ ] 添加用户登录系统
- [ ] 支持保存测试历史
- [ ] 添加题目分类功能
- [ ] 实现题目搜索功能
- [ ] 支持自定义测试题数量

## 许可证

MIT License

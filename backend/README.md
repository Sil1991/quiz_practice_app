# 后端服务

这是 AIF-C01 问答测试应用的后端服务，负责从PDF文件中提取问题和答案，并提供API接口给前端使用。

## 功能特性

- ✅ 从PDF文件中自动提取问题和答案
- ✅ 支持解析单选题和多选题
- ✅ 随机生成测试题
- ✅ 提供RESTful API接口
- ✅ 支持跨域请求

## 技术栈

- NodeJS
- Express
- pdf-parse (PDF解析)
- cors (跨域支持)

## 安装

### 1. 安装依赖

```bash
npm install
```

### 2. 准备PDF文件

将 `AIF-C01 Exam Q&A(224)-1.pdf` 文件复制到 `../data/` 目录。

## 运行

### 开发模式

```bash
# 安装 nodemon (如果尚未安装)
npm install -g nodemon

# 启动开发服务器
npm run dev
```

### 生产模式

```bash
npm start
```

### 终止服务

```bash
# 终止后端服务（Mac/Linux）
pkill -f "node server.js"

# 或者在运行服务的终端中使用 Ctrl+C
```

## API 接口

### GET /api/questions

**功能**：获取随机10道测试题

**响应**：

```json
[
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
  },
  // 更多问题...
]
```

### POST /api/check-answer

**功能**：验证答案正确性

**请求参数**：

```json
{
  "question": {
    "question": "1.A company makes forecasts each quarter...",
    "options": ["A.Code for model training", "B.Partial dependence plots （PDPs）", "C.Sample data for training", "D.Model convergence tables"],
    "answer": "答案:B",
    "is_multiple": false
  },
  "selected": ["B"],
  "isMultiple": false
}
```

**响应**：

```json
{
  "isCorrect": true,
  "correctLetters": ["B"]
}
```

## 配置

- **端口**：3001
- **PDF文件路径**：`../data/AIF-C01 Exam Q&A(224)-1.pdf`
- **测试题数量**：10

## 故障排查

### 1. PDF文件未找到

- 确保PDF文件存在于 `../data/` 目录
- 确保文件名正确：`AIF-C01 Exam Q&A(224)-1.pdf`

### 2. PDF解析失败

- 检查PDF文件格式是否正确
- 检查PDF文件是否有密码保护
- 查看控制台日志获取详细错误信息

### 3. 端口被占用

- 检查是否有其他服务占用了端口3001
- 修改 `server.js` 中的端口配置

## 日志

后端服务会在控制台输出以下信息：
- 服务器启动信息
- API请求记录
- PDF解析状态
- 错误信息

## 扩展

### 添加新的PDF文件

1. 将新的PDF文件复制到 `../data/` 目录
2. 修改 `server.js` 中的 `pdfPath` 变量
3. 重启后端服务

### 调整测试题数量

修改 `server.js` 中的 `generateQuiz` 函数，调整默认参数。

## 许可证

MIT License

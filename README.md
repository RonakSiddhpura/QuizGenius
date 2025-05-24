
# 🎓 QuizGenius

QuizGenius is a full-stack intelligent quiz platform that allows admins to generate quizzes (including AI-powered news-based questions) and users to register, participate, and track their quiz history. It features role-based access, JWT authentication, scheduling, and AI integration using Google Gemini and LangChain.

## 📁 Project Structure

```
quizgenius/
├── backend/              # Flask API server with AI and MongoDB integration
├── frontend/             # Vite + React frontend
├── .gitignore            # Combined frontend and backend ignore rules
└── README.md             # Project documentation
```

## 🚀 Tech Stack

**Frontend:**
- React + Vite
- Axios
- React Router
- Tailwind CSS

**Backend:**
- Flask + Flask-JWT-Extended
- PyMongo (MongoDB)
- Google Generative AI API (Gemini)
- LangChain + FAISS (for vector store)
- BeautifulSoup + undetected-chromedriver (for web scraping)

## ⚙️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/quizgenius.git
cd quizgenius
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
MONGO_URI=mongodb://localhost:27017/quiz_generator
JWT_SECRET_KEY=your-very-secure-secret
JWT_ACCESS_TOKEN_EXPIRES_DAYS=1
GENAI_API_KEY=your-google-generativeai-api-key
```

Then run the Flask server:

```bash
python app.py
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

Create `.env` in `frontend/`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Start the frontend server:

```bash
npm run dev
```

## ✅ Features

### Admin:
- Login/Register
- Generate quizzes (general or news-based)
- Review, edit, and approve questions
- Schedule quizzes with duration
- Track quiz creation history

### Users:
- Register/Login
- View upcoming quizzes
- Register for quizzes
- Attempt quizzes within a time window
- View past attempts and rankings

## 🔐 Environment Files

### backend/.env Example

```env
MONGO_URI=mongodb://localhost:27017/quiz_generator
JWT_SECRET_KEY=your-very-secure-secret
JWT_ACCESS_TOKEN_EXPIRES_DAYS=1
GENAI_API_KEY=your-google-generativeai-api-key
```

### frontend/.env Example

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## 📝 License

MIT License © [Ronak Siddhpura]

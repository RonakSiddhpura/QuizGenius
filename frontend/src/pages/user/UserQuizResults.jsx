//src/pages/admin/AdminCreateQuiz.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../../contexts/AuthContext'; // Assuming apiClient is correctly configured
import { CheckCircle, XCircle, Clock, Award, ArrowLeft, Users, HelpCircle, BarChart, Target, Check } from 'lucide-react'; // Added Target, Check icons

// --- Keep LoadingSpinner, ErrorMessage, InfoMessage, StatCard components as they are ---
// Reusable Loading Spinner Component
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center py-10">
    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-4 text-lg text-gray-600">Loading Results...</p>
  </div>
);

// Reusable Error Message Component
const ErrorMessage = ({ message }) => (
  <div className="flex items-center p-4 my-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
    <XCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <div><span className="font-medium">Error:</span> {message || 'Could not load results.'}</div>
  </div>
);

// Reusable Info Message Component
const InfoMessage = ({ message }) => (
  <div className="flex items-center p-4 my-4 text-sm text-blue-700 bg-blue-100 rounded-lg" role="alert">
    <HelpCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <div>{message}</div>
  </div>
);

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, bgColor, iconColor }) => (
  <div className={`flex items-center p-4 ${bgColor} rounded-lg shadow-sm`}>
    <div className={`p-2 rounded-full ${iconColor} bg-opacity-20 mr-3`}>
      <Icon className={`w-5 h-5 ${iconColor}`} />
    </div>
    <div>
      <p className="text-xs text-gray-600 uppercase font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  </div>
);
// --- End of Helper Components ---

// --- Date Helper Functions (same as UserDashboard) ---
const getIsoStringFromDateInput = (dateInput) => {
  if (!dateInput) return null;
  if (typeof dateInput === 'object' && dateInput !== null && dateInput.$date && typeof dateInput.$date === 'string') {
      if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput.$date)) { return dateInput.$date; }
      else { console.warn("Invalid $date value:", dateInput.$date); return null; }
  } else if (typeof dateInput === 'string') {
      if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput)) { return dateInput; }
      else { console.warn("Received non-ISO string:", dateInput); return null; }
  } else if (dateInput instanceof Date) {
      try { if (!isNaN(dateInput.getTime())) { return dateInput.toISOString(); } else { return null;} }
      catch (e) { console.error("Date->ISO err:", e); return null; }
  }
  console.warn("Unexpected date format:", dateInput); return null;
};

const formatDisplayDateTime = (dateInput) => {
  const isoString = getIsoStringFromDateInput(dateInput);
  if (!isoString) return "N/A";
  try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "Invalid Date";
      return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
  } catch (e) { console.error("Error formatting date:", isoString, e); return "Invalid Date"; }
};

const UserQuizResults = () => {
  const { quizId } = useParams();
  const [resultsData, setResultsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchQuizResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get(`/api/quiz/results/${quizId}`);
        console.log("API Response Data:", response.data);
        // Basic validation
        if (!response.data || !response.data.submission || !response.data.quiz_questions) {
            throw new Error("Incomplete results data received from server.");
        }
        setResultsData(response.data);
      } catch (err) {
        console.error('Error fetching quiz results - Status:', err.response?.status);
        console.error('Error fetching quiz results - Data:', err.response?.data);
        console.error('Error fetching quiz results - Message:', err.message);
        setError(err.response?.data?.error || err.message || `Failed to load quiz results (Status: ${err.response?.status || 'Network Error'}). Please try again later.`);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizResults();
  }, [quizId]);

  const formatTime = (seconds) => {
    // ... (keep existing formatTime)
    if (seconds === undefined || seconds === null || isNaN(seconds)) return 'N/A';
    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full text-center">
          <ErrorMessage message={error} />
          <Link to="/user/history" className="mt-6 inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
            <ArrowLeft className="w-4 h-4 mr-1" /> Go to Quiz History
          </Link>
        </div>
      </div>
    );
  }

  // --- No Data State ---
  if (!resultsData || !resultsData.submission || !resultsData.quiz_questions) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full text-center">
          {/* Provide a more specific message if possible */}
          <InfoMessage message={resultsData?.error || "Quiz results data is incomplete or unavailable. You might need to complete the quiz first."} />
          <Link to="/user/history" className="mt-6 inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
            <ArrowLeft className="w-4 h-4 mr-1" /> Go to Quiz History
          </Link>
        </div>
      </div>
    );
  }

  // --- Destructure Data ---
  // Ensure quiz_questions is destructured here
  const { submission, rank, total_participants, quiz_info, quiz_questions } = resultsData;
  const score = submission.score;
  const totalQuestions = submission.total;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  // Helper to parse option letter (handles 'a)', 'a.', ' a ', etc.)
  const getOptionLetter = (optionString) => {
      const match = optionString?.match(/^\s*([a-zA-Z])[\.\)]?/);
      return match ? match[1].toLowerCase() : null;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-10">
      <Link to="/user/history" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to History
      </Link>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-5 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Quiz Results</h1>
              <p className="text-sm text-blue-100 mt-1">{quiz_info?.topic || 'Quiz'} - {quiz_info?.type || ''}</p>
            </div>
            <div className="text-center sm:text-right mt-2 sm:mt-0">
              <p className="text-sm text-blue-200">Submitted:</p>
              <p className="text-sm font-medium text-white">{formatDisplayDateTime(submission.submitted_at)}</p>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <StatCard icon={CheckCircle} label="Score" value={`${score} / ${totalQuestions}`} bgColor="bg-blue-50" iconColor="text-blue-600" />
            <StatCard icon={BarChart} label="Percentage" value={`${percentage}%`} bgColor="bg-yellow-50" iconColor="text-yellow-600" />
            <StatCard icon={Award} label="Rank" value={`${rank} / ${total_participants}`} bgColor="bg-green-50" iconColor="text-green-600" />
            <StatCard icon={Clock} label="Time Taken" value={formatTime(submission.completion_time_seconds)} bgColor="bg-purple-50" iconColor="text-purple-600" />
          </div>

          {/* ==== DETAILED QUESTION REVIEW ==== */}
          <h2 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Detailed Review</h2>
          <div className="space-y-6 mt-4">
            {quiz_questions && Array.isArray(quiz_questions) && quiz_questions.map((question, index) => {
              // Get user's answer and correct answer for this question index
              const userAnsLetter = submission.submitted_answers?.[index]?.toLowerCase() || null;
              const correctAnsLetter = submission.correct_answers?.[index]?.toLowerCase() || null;

              return (
                <div key={`q-${index}`} className="border border-gray-200 rounded-lg p-4 shadow-sm bg-gray-50/50">
                  {/* Question Text */}
                  <p className="mb-3 font-semibold text-gray-700">
                    <span className="mr-2 text-blue-600">Q{index + 1}.</span>
                    {question.question}
                  </p>

                  {/* Options List */}
                  <div className="space-y-2 ml-6">
                    {question.options && Array.isArray(question.options) && question.options.map((optionText, optIndex) => {
                      const optionLetter = getOptionLetter(optionText); // e.g., 'a', 'b'
                      if (!optionLetter) return null; // Skip if option format is invalid

                      const isCorrect = optionLetter === correctAnsLetter;
                      const isUserChoice = optionLetter === userAnsLetter;
                      const displayOptionText = optionText.replace(/^\s*[a-zA-Z][\.\)]?\s*/, ''); // Remove 'a) ' prefix

                      // Determine highlighting
                      let optionClasses = "flex items-center p-2.5 rounded-md border text-sm transition-colors ";
                      let icon = null;

                      if (isCorrect) {
                        optionClasses += " bg-green-100 border-green-300 text-green-900 font-medium";
                        icon = <CheckCircle className="w-4 h-4 text-green-600 mr-2 flex-shrink-0" />;
                      } else if (isUserChoice) {
                        optionClasses += " bg-red-100 border-red-300 text-red-900";
                        icon = <XCircle className="w-4 h-4 text-red-600 mr-2 flex-shrink-0" />;
                      } else {
                        optionClasses += " bg-white border-gray-200 text-gray-700";
                      }

                      return (
                        <div key={`q-${index}-opt-${optIndex}`} className={optionClasses}>
                          {icon}
                          <span className="font-bold uppercase mr-2">{optionLetter}.</span>
                          <span>{displayOptionText}</span>
                          {isUserChoice && !isCorrect && <span className="ml-auto text-xs font-semibold text-red-600">(Your Answer)</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* ==== END DETAILED REVIEW ==== */}


          {/* Leaderboard link */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-center items-center gap-4">
            <p className="text-sm text-gray-600">See how you rank against others:</p>
            <Link
              to={`/quiz/leaderboard/${quizId}`} // Link to the FRONTEND route
              className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Users className="w-4 h-4 mr-1.5" /> View Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserQuizResults;
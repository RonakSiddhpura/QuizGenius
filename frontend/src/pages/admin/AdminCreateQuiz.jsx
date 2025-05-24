
// src/pages/admin/AdminCreateQuiz.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext'; // Adjusted path if necessary
import { BookOpen, Newspaper, Loader, PlusCircle, Clock } from 'lucide-react'; // Removed AlertTriangle as toast is used
import axios from 'axios';
import toast from 'react-hot-toast'; // Import toast

// Helper function to get base URL from environment variables
const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_BASE_URL || ''; // Default to empty string if not set
};

// Helper function to get Auth Headers
const getAuthHeaders = () => {
    const token = localStorage.getItem("token"); // Assuming token is stored here by AuthProvider
    if (!token) {
        console.error("Auth token is missing from localStorage.");
        throw new Error("Authentication token not found."); // Let calling function handle
    }
    return { Authorization: `Bearer ${token}` };
};


const AdminCreateQuiz = () => {
  const { token } = useAuth(); // Get token from context
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  // Removed local error state, will use toast
  // Removed local success state as navigation is immediate
  const [quizData, setQuizData] = useState({
    quiz_type: 'General Quiz',
    topic: '',
    difficulty: 'Medium',
    num_mcqs: 10,
    language: 'English'
  });
  const [recommendations, setRecommendations] = useState([]);

  // Fetch topic recommendations
  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!token) {
        console.log("No token available for fetching recommendations.");
        return;
      }

      try {
        // Use helper for headers
        const headers = getAuthHeaders();
        const response = await axios.get(`${getApiBaseUrl()}/api/recommendations`, { headers });
        setRecommendations(response.data.recommendations || []);
      } catch (error) {
        // Non-critical error, don't block UI, just log it
        console.error('Error fetching recommendations:', error);
        // Optionally: toast.error("Could not load topic suggestions.", { duration: 2000 });
      }
    };

    fetchRecommendations();
  }, [token]); // Refetch if token changes

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setQuizData(prevData => ({
      ...prevData,
      [name]: name === 'num_mcqs' ? (parseInt(value, 10) || 1) : value // Default to 1 if parse fails
    }));
  };

  // Handle clicking on a recommended topic
  const handleRecommendationClick = (topic) => {
    setQuizData(prevData => ({
      ...prevData,
      topic
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    // Clear previous toasts if necessary, or let them expire
    // toast.dismiss(); // Example: dismiss previous toasts

    let headers;
    try {
        headers = getAuthHeaders(); // Get headers early, throws if no token
    } catch (authError) {
        toast.error(authError.message || "Authentication error. Please log in.");
        setIsLoading(false);
        return; // Stop submission if token is missing/invalid
    }

    // Prepare Payload & Validate Fields
    const payload = {
      ...quizData,
      topic: quizData.topic.trim(),
      num_mcqs: parseInt(quizData.num_mcqs, 10) || 10,
    };

    if (!payload.topic) {
      toast.error("Topic cannot be empty.");
      setIsLoading(false);
      return;
    }

    const maxQuestions = 20; // Match backend limit
    if (payload.num_mcqs < 1 || payload.num_mcqs > maxQuestions) {
      toast.error(`Number of questions must be between 1 and ${maxQuestions}.`);
      setIsLoading(false);
      return;
    }

    console.log("➡️ Submitting quiz generation payload:", payload);

    // --- API Call ---
    try {
      const response = await axios.post(`${getApiBaseUrl()}/api/quiz/generate`, payload, { headers });

      console.log("✅ Quiz generation successful:", response.data);
      toast.success(response.data.message || "Quiz generated successfully!");
      const quizId = response.data.quiz_id;

      // Navigate immediately to the review page
      navigate(`/admin/review-quiz/${quizId}`);
      // No need to set loading false here as we are navigating away

    } catch (err) {
      console.error('❌ Quiz generation failed:', err);
      const backendError = err?.response?.data?.error;
      const details = err?.response?.data?.details; // Capture potential details
      const status = err?.response?.status;
      let errorMessage = 'An unexpected error occurred while generating the quiz.';

      if (status === 401 || status === 403) {
          errorMessage = backendError || "Authorization failed. Please log in again or check permissions.";
      } else if (backendError) {
          errorMessage = backendError; // Use the specific error from backend
          if (details) { // Append details if available
              errorMessage += ` (${details})`;
          }
      } else if (err.request) {
          errorMessage = "Could not reach the server. Please check your connection.";
      } else if (err.message === "Authentication token not found.") {
          errorMessage = "Authentication error. Please log in again.";
      }
      // Use toast to display the error
      toast.error(errorMessage);
      setIsLoading(false); // Set loading false only on error

    }
    // Removed finally block as setLoading(false) is handled in the success (navigation) and error paths.
  };


  // Render Component
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold mb-6 text-gray-800">Create New Quiz</h1>

        {/* Error Alert removed - using react-hot-toast instead */}

        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 border border-gray-200">
          <h2 className="text-xl font-semibold mb-6 text-gray-700 border-b pb-3">Quiz Details</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Quiz Type Selection */}
            <div>
              <label className="block text-gray-700 mb-2 font-medium">Quiz Type</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* General Quiz Option */}
                <div
                  role="button" // Added role for accessibility
                  tabIndex={0} // Make it focusable
                  aria-pressed={quizData.quiz_type === 'General Quiz'} // Accessibility state
                  className={`border rounded-lg p-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                    quizData.quiz_type === 'General Quiz'
                      ? 'border-indigo-500 bg-indigo-50 ring-indigo-300'
                      : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50 focus:ring-indigo-300' // Added focus ring
                  }`}
                  onClick={() => setQuizData({ ...quizData, quiz_type: 'General Quiz' })}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setQuizData({ ...quizData, quiz_type: 'General Quiz' }) : null} // Keyboard accessibility
                >
                  <div className="flex items-center mb-1">
                    <BookOpen className="h-5 w-5 mr-2 text-indigo-600 flex-shrink-0" />
                    <span className="font-medium text-gray-800">General Quiz</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Standard quiz on any topic.
                  </p>
                </div>
                {/* News-Based Quiz Option */}
                <div
                  role="button" // Added role
                  tabIndex={0} // Make focusable
                  aria-pressed={quizData.quiz_type === 'News-Based Quiz'}
                  className={`border rounded-lg p-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                    quizData.quiz_type === 'News-Based Quiz'
                      ? 'border-indigo-500 bg-indigo-50 ring-indigo-300'
                      : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50 focus:ring-indigo-300' // Added focus ring
                  }`}
                  onClick={() => setQuizData({ ...quizData, quiz_type: 'News-Based Quiz' })}
                   onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setQuizData({ ...quizData, quiz_type: 'News-Based Quiz' }) : null} // Keyboard accessibility
                >
                  <div className="flex items-center mb-1">
                    <Newspaper className="h-5 w-5 mr-2 text-indigo-600 flex-shrink-0" />
                    <span className="font-medium text-gray-800">News-Based Quiz</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Based on recent news articles.
                  </p>
                </div>
              </div>
            </div>

            {/* Topic Input */}
            <div>
              <label htmlFor="topic" className="block text-gray-700 mb-2 font-medium">
                Topic <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="topic"
                name="topic"
                value={quizData.topic}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm"
                placeholder="e.g., 'Quantum Physics', 'Recent AI Developments'"
                required
                aria-required="true"
              />
              {/* Recommendations Display */}
              {recommendations.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1.5" id="suggestions-label">Suggestions:</p>
                  <div className="flex flex-wrap gap-2" role="listbox" aria-labelledby="suggestions-label">
                    {recommendations.map((topic, index) => (
                      <button
                        type="button" // Important: prevent form submission
                        key={index}
                        role="option" // Accessibility role
                        aria-selected={quizData.topic === topic}
                        onClick={() => handleRecommendationClick(topic)}
                        className="bg-gray-100 hover:bg-indigo-100 text-gray-700 hover:text-indigo-700 text-sm px-3 py-1 rounded-full cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:ring-offset-1"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Difficulty & Number of Questions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="difficulty" className="block text-gray-700 mb-2 font-medium">
                  Difficulty
                </label>
                <select
                  id="difficulty"
                  name="difficulty"
                  value={quizData.difficulty}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 bg-white shadow-sm appearance-none"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div>
                <label htmlFor="num_mcqs" className="block text-gray-700 mb-2 font-medium">
                  Number of Questions <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="num_mcqs"
                  name="num_mcqs"
                  value={quizData.num_mcqs}
                  min="1"
                  max="20" // Match backend validation limit
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm"
                  placeholder="e.g., 10"
                  required
                  aria-required="true"
                />
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <label htmlFor="language" className="block text-gray-700 mb-2 font-medium">
                Language
              </label>
              <select
                id="language"
                name="language"
                value={quizData.language}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 bg-white shadow-sm appearance-none"
              >
                {/* Default/Common Languages */}
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                {/* Add others supported by Gemini */}
                <option value="Portuguese">Portuguese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
              </select>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200 mt-6"> {/* Added mt-6 */}
              <button
                type="submit"
                disabled={isLoading}
                className={`inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out ${
                    isLoading
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
                style={{ minWidth: '160px' }} // Ensure button has minimum width
              >
                {isLoading ? (
                  <>
                    <Loader className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-5 w-5 mr-2" />
                    Generate Quiz
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Info Box for News-Based Quiz */}
        {quizData.quiz_type === 'News-Based Quiz' && (
          <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-start">
              <Clock className="h-5 w-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-blue-800 font-medium">Heads up!</p>
                <p className="text-sm text-blue-700 mt-1">
                    News-based quizzes might take a bit longer (30-90 seconds) as the system finds and reads recent articles for your topic.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCreateQuiz;
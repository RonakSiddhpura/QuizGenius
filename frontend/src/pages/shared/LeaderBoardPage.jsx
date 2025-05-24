// src/pages/shared/LeaderboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../../contexts/AuthContext'; // Adjust path if needed
import { Award, ArrowLeft, Clock, Loader2, XCircle, Trophy } from 'lucide-react';

// --- Reusable Components (Optional: Move to a shared file) ---
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center py-10">
    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
    <p className="mt-4 text-lg text-gray-600">Loading Leaderboard...</p>
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="flex items-center p-4 my-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
    <XCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <div><span className="font-medium">Error:</span> {message || 'Could not load leaderboard.'}</div>
  </div>
);
// --- End Reusable Components ---


const LeaderboardPage = () => {
  const { quizId } = useParams();
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [quizInfo, setQuizInfo] = useState(null); // Optional: Fetch quiz info too
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch leaderboard data from the BACKEND API endpoint
        const response = await apiClient.get(`/api/quiz/leaderboard/${quizId}`);
        console.log("Leaderboard API Response:", response.data);

        // Optional: Fetch basic quiz info if needed (could be combined on backend)
        // const quizInfoResponse = await apiClient.get(`/api/quiz/${quizId}?basic=true`); // Example
        // setQuizInfo(quizInfoResponse.data);

        setLeaderboardData(response.data?.leaderboard || []);
      } catch (err) {
        console.error('Error fetching leaderboard:', err.response?.data || err.message);
        setError(err.response?.data?.error || 'Failed to load leaderboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [quizId]);

  const formatTime = (seconds) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return '--';
    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
  };

   const getRankColor = (rank) => {
    if (rank === 1) return 'text-yellow-500';
    if (rank === 2) return 'text-gray-400';
    if (rank === 3) return 'text-yellow-700'; // Bronze-ish
    return 'text-gray-500';
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
       <Link to="/user/history" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-6">
           <ArrowLeft className="w-4 h-4 mr-1" /> Back to History
       </Link>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 text-white flex items-center gap-3">
           <Trophy className="w-8 h-8" />
           <div>
                <h1 className="text-xl md:text-2xl font-bold">Quiz Leaderboard</h1>
                {/* Conditionally render quiz topic if fetched */}
                {/* {quizInfo?.topic && <p className="text-sm text-purple-100 mt-1">{quizInfo.topic}</p>} */}
           </div>
        </div>

        {leaderboardData.length === 0 ? (
          <p className="text-center text-gray-500 py-10">No submissions found for this quiz yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Rank
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboardData.map((entry) => (
                  <tr key={entry.rank} className="hover:bg-gray-50">
                    <td className={`px-4 py-4 whitespace-nowrap text-center text-sm font-bold ${getRankColor(entry.rank)}`}>
                       {entry.rank === 1 && <Award className="w-4 h-4 inline-block mr-1 mb-0.5 text-yellow-400" />}
                       {entry.rank === 2 && <Award className="w-4 h-4 inline-block mr-1 mb-0.5 text-gray-400" />}
                       {entry.rank === 3 && <Award className="w-4 h-4 inline-block mr-1 mb-0.5 text-yellow-600" />}
                       {entry.rank}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {entry.user_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                      {entry.score} / {entry.total}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                      <span className="inline-flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1 text-gray-400" />
                        {formatTime(entry.completion_time)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardPage;
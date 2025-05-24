// src/pages/admin/AdminDashboard.jsx

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { BookOpen, User, TrendingUp, BarChart, CheckSquare, Loader2 } from 'lucide-react'; // Use different Loader icon

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Helper function to get Authorization header
const getAuthHeader = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Helper function for fetching data
const fetchData = async (url) => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"; // Default if not set
  const fullUrl = `${baseUrl}${url}`;

  console.log("Fetching:", fullUrl);

  const response = await fetch(fullUrl, { headers: getAuthHeader() });
  if (!response.ok) {
    let errorMsg = `Failed to fetch ${url}. Status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorData.message || errorMsg; // Check for 'message' too
      console.error("API Error Data:", errorData);
    } catch (e) {
       console.error("API response parsing error:", e);
    }
    throw new Error(errorMsg);
  }
  return response.json();
};


const AdminDashboard = () => {
  const [timeRange, setTimeRange] = useState('month');

  // Fetch admin analytics (General Overview - FLAT structure expected)
  const { data: analyticsData, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: () => fetchData('/api/admin/analytics') // Fetches the flat structure
  });

  // Fetch quiz completions data based on time range
  const { data: completionsData, isLoading: completionsLoading, error: completionsError } = useQuery({
    queryKey: ['quizCompletions', timeRange],
    queryFn: () => fetchData(`/api/admin/analytics/quiz-completions?range=${timeRange}`),
    enabled: !!timeRange
  });

  // Fetch user activity data based on time range
  const { data: userActivityData, isLoading: userActivityLoading, error: userActivityError } = useQuery({
    queryKey: ['userActivity', timeRange],
    queryFn: () => fetchData(`/api/admin/analytics/user-activity?range=${timeRange}`),
    enabled: !!timeRange
  });

  // Fetch category distribution data
  const { data: categoryData, isLoading: categoryLoading, error: categoryError } = useQuery({
    queryKey: ['categoryDistribution'],
    queryFn: () => fetchData('/api/admin/analytics/category-distribution')
  });

  // Fetch top quizzes data
  const { data: topQuizzesData, isLoading: topQuizzesLoading, error: topQuizzesError } = useQuery({
    queryKey: ['topQuizzes', 5],
    queryFn: () => fetchData('/api/admin/analytics/top-quizzes?limit=5')
  });


  // --- Prepare chart data safely ---
  // Completions Chart (Backend returns: data: [{ date, value }])
  const completionsChartData = {
    labels: completionsData?.data?.map(item => item.date) || [],
    datasets: [
      {
        label: 'Quiz Completions',
        // *** CORRECTED DATA KEY ***
        data: completionsData?.data?.map(item => item.value) || [],
        backgroundColor: 'rgba(59, 130, 246, 0.5)', // Tailwind blue-500
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  };

  // User Activity Chart (Backend returns: data: [{ date, active_users }])
  const userActivityChartData = {
    labels: userActivityData?.data?.map(item => item.date) || [],
    datasets: [
      {
        label: 'Active Users',
         // *** CORRECTED DATA KEY ***
        data: userActivityData?.data?.map(item => item.active_users) || [],
        backgroundColor: 'rgba(16, 185, 129, 0.5)', // Tailwind emerald-500
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Category Chart (Backend returns: categories: [{ name, value }])
  const categoryChartData = {
    labels: categoryData?.categories?.map(item => item.name) || [],
    datasets: [
      {
        label: 'Quiz Count by Category',
        // *** CORRECTED DATA KEY ***
        data: categoryData?.categories?.map(item => item.value) || [],
        backgroundColor: [ // Keep colors or generate dynamically based on length
          'rgba(255, 99, 132, 0.6)', 'rgba(54, 162, 235, 0.6)', 'rgba(255, 206, 86, 0.6)',
          'rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
          'rgba(99, 255, 132, 0.6)', 'rgba(201, 203, 207, 0.6)' // Added gray
        ],
        borderColor: [
            'rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)',
            'rgba(99, 255, 132, 1)', 'rgba(201, 203, 207, 1)'
        ],
        borderWidth: 1,
      },
    ],
  };

  // --- Loading and Error States ---
  const isLoading = analyticsLoading || completionsLoading || userActivityLoading || categoryLoading || topQuizzesLoading;
  const errors = [analyticsError, completionsError, userActivityError, categoryError, topQuizzesError].filter(Boolean);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-gray-600">
        <Loader2 className="animate-spin h-10 w-10 mr-3 text-indigo-500" />
        Loading Dashboard Data...
      </div>
    );
  }

   if (errors.length > 0) {
    return (
      <div className="p-6 bg-red-100 border border-red-400 text-red-700 rounded mx-auto my-10 max-w-2xl shadow">
        <h2 className="font-bold mb-2 text-lg">Error Loading Dashboard Data</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {errors.map((error, index) => (
            <li key={index}>{error.message || 'An unknown error occurred'}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm">Please check your connection or try refreshing the page.</p>
      </div>
    );
  }

  // --- Main Dashboard Render ---
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <Link
          to="/admin/create-quiz"
          className="bg-indigo-600 text-white px-6 py-2 rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition duration-150 ease-in-out"
        >
          Create New Quiz
        </Link>
      </div>

      {/* Stats Overview - Accessing FLAT structure from /api/admin/analytics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users Card */}
        <div className="bg-white rounded-lg shadow-md p-5 border border-gray-200">
          <div className="flex items-center">
            <div className="bg-indigo-100 p-3 rounded-full mr-4">
              <User className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Users</p>
              <p className="text-2xl font-semibold text-gray-800">
                {/* *** CORRECTED DATA ACCESS *** */}
                {analyticsData?.total_users ?? 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Total Quizzes Card */}
        <div className="bg-white rounded-lg shadow-md p-5 border border-gray-200">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-full mr-4">
              <BookOpen className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Quizzes</p>
              <p className="text-2xl font-semibold text-gray-800">
                 {/* *** CORRECTED DATA ACCESS *** */}
                {analyticsData?.total_quizzes ?? 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Total Submissions Card */}
        <div className="bg-white rounded-lg shadow-md p-5 border border-gray-200">
          <div className="flex items-center">
            <div className="bg-yellow-100 p-3 rounded-full mr-4">
              <CheckSquare className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Submissions</p>
              <p className="text-2xl font-semibold text-gray-800">
                 {/* *** CORRECTED DATA ACCESS *** */}
                {analyticsData?.total_submissions ?? 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Top Topic Card (Uses topQuizzesData) */}
        <div className="bg-white rounded-lg shadow-md p-5 border border-gray-200">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-full mr-4">
               <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Most Popular Topic</p>
              <p className="text-xl font-semibold text-gray-800 truncate" title={topQuizzesData?.quizzes?.[0]?.title ?? 'N/A'}>
                 {/* *** CORRECTED DATA ACCESS *** */}
                {topQuizzesData?.quizzes?.[0]?.title ?? 'N/A'} {/* Use title from top quizzes */}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quiz Completions Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
            <h2 className="text-xl font-semibold text-gray-700">Quiz Completions</h2>
            {/* Note: Time range selector now applies to both charts if needed */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="week">Past Week</option>
              <option value="month">Past Month</option>
              <option value="year">Past Year</option>
            </select>
          </div>
          <div className="h-64 sm:h-80 relative">
            {completionsChartData?.datasets?.[0]?.data?.length > 0 ? (
              <Bar
                data={completionsChartData}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, title: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } // Ensure integer ticks
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 italic">
                No completion data for this period
              </div>
            )}
          </div>
        </div>

        {/* Active Users Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-gray-200">
           <h2 className="text-xl font-semibold text-gray-700 mb-4">Active Users ({timeRange})</h2>
          <div className="h-64 sm:h-80 relative">
            {userActivityChartData?.datasets?.[0]?.data?.length > 0 ? (
              <Bar
                data={userActivityChartData}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, title: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } // Ensure integer ticks
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 italic">
                No user activity data for this period
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Categories and Top Quizzes Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quiz Categories Pie Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-gray-200 lg:col-span-1">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Quiz Categories (Count)</h2>
          <div className="h-64 sm:h-80 relative">
            {categoryChartData?.datasets?.[0]?.data?.length > 0 ? (
              <Pie
                data={categoryChartData}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } },
                      tooltip: { // Add tooltip callbacks if needed
                          callbacks: { label: (context) => `${context.label}: ${context.raw}` }
                      }
                  }
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 italic">
                No category data available
              </div>
            )}
          </div>
        </div>

        {/* Top Quizzes Table */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-gray-200 lg:col-span-2">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Most Popular Quizzes (Top 5)</h2>
          {topQuizzesData?.quizzes?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title {/* Changed from Topic */}
                    </th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"> {/* Changed alignment */}
                      Completions
                    </th>
                     <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"> {/* Changed alignment */}
                      Avg. Score (%)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topQuizzesData.quizzes.map((quiz) => (
                    // *** CORRECTED KEY and DISPLAY ***
                    <tr key={quiz._id} className="hover:bg-gray-50"> {/* Use _id */}
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {quiz.title} {/* Use title */}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {quiz.completions}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {quiz.average_percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="flex items-center justify-center h-48 text-gray-500 italic">
                No popular quiz data available
              </div>
          )}
        </div>
      </div>

      {/* Quick Links Section */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/admin/users"
            className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 hover:shadow-sm transition duration-150"
          >
            <User className="h-5 w-5 text-indigo-600 mr-3 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">Manage Users</span>
          </Link>
          <Link
            to="/admin/quizzes"
            className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 hover:shadow-sm transition duration-150"
          >
            <BookOpen className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">Manage Quizzes</span>
          </Link>
          <Link
            to="/admin/analytics" // Link to the dedicated analytics page maybe? Or keep this one?
            className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 hover:shadow-sm transition duration-150"
          >
            <BarChart className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">View Analytics</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
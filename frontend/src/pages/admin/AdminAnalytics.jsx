// src/pages/admin/AdminAnalytics.jsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { Calendar, ChevronDown, Users, Award, BarChart3, Loader, AlertTriangle } from 'lucide-react';
import axios from 'axios';

// --- Helper Functions ---

// Helper function to get base URL from environment variables
const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_BASE_URL || ''; // Default to empty string if not set
};

// Helper function to get Auth Headers
const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("Auth token is missing from localStorage.");
        throw new Error("Authentication token not found."); // Let useQuery handle this
    }
    return { Authorization: `Bearer ${token}` };
};

// Colors for Pie Chart
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

// --- Components ---

// Custom Time Range Selector Component
const TimeRangeSelector = ({ selected, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { value: 'week', label: 'Last 7 Days' },
    { value: 'month', label: 'Last 30 Days' },
    { value: 'year', label: 'Last Year' }
  ];

  const selectedLabel = options.find(opt => opt.value === selected)?.label || 'Select Range';

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center justify-between w-full gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {selectedLabel}
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
            className="absolute right-0 z-10 w-40 mt-1 origin-top-right bg-white border border-gray-200 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="options-menu"
        >
          <div className="py-1" role="none">
            {options.map(option => (
              <button
                key={option.value}
                className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 text-left"
                role="menuitem"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
       {/* Close dropdown if clicked outside */}
       {isOpen && <div className="fixed inset-0 z-0" onClick={() => setIsOpen(false)}></div>}
    </div>
  );
};

// Main Analytics Component
const AdminAnalytics = () => {
  const [timeRange, setTimeRange] = useState('month');

  // --- React Query Data Fetching ---

  // Fetch Quiz Completions
  const {
    data: completionsData,
    isLoading: isLoadingCompletions,
    error: errorCompletions
  } = useQuery({
    queryKey: ['quizCompletions', timeRange],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/admin/analytics/quiz-completions?range=${timeRange}`, { headers: getAuthHeaders() });
      // Ensure data format is as expected (array)
      return (response.data?.data || []).map(item => ({
          date: item.date, // Already formatted by backend
          // *** CORRECTED KEY ***
          Completions: item.value // Use 'value' key from backend
      }));
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch User Activity
  const {
    data: userActivityData,
    isLoading: isLoadingActivity,
    error: errorActivity
  } = useQuery({
    queryKey: ['userActivity', timeRange],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/admin/analytics/user-activity?range=${timeRange}`, { headers: getAuthHeaders() });
       return (response.data?.data || []).map(item => ({
          date: item.date,
          // *** CORRECTED KEY ***
          'Active Users': item.active_users // Use 'active_users' key from backend
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Top Quizzes
  const {
    data: topQuizzesData,
    isLoading: isLoadingTopQuizzes,
    error: errorTopQuizzes
  } = useQuery({
    queryKey: ['topQuizzes'], // Add limit if needed, e.g., ['topQuizzes', 10]
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/admin/analytics/top-quizzes?limit=10`, { headers: getAuthHeaders() });
      // Use the structure returned by the backend
      return response.data?.quizzes || [];
    },
    staleTime: 10 * 60 * 1000, // Cache longer as it changes less often
  });

  // Fetch Category Distribution
  const {
    data: categoryData,
    isLoading: isLoadingCategories,
    error: errorCategories
  } = useQuery({
    queryKey: ['categoryDistribution'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/admin/analytics/category-distribution`, { headers: getAuthHeaders() });
      // Backend returns categories: [{ name: ..., value: ...}]
      return response.data?.categories || [];
    },
     staleTime: 10 * 60 * 1000,
  });

  // Combined Loading and Error States
  const isLoading = isLoadingCompletions || isLoadingActivity || isLoadingTopQuizzes || isLoadingCategories;
  const queryErrors = [errorCompletions, errorActivity, errorTopQuizzes, errorCategories].filter(Boolean);

  // --- Render Logic ---

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center">
            <BarChart3 className="mr-3 h-7 w-7 text-indigo-600" />
            Analytics Dashboard
        </h1>
        <TimeRangeSelector
            selected={timeRange}
            onChange={setTimeRange}
            disabled={isLoading} // Disable selector while loading
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
          <Loader className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
          <p>Loading analytics data...</p>
        </div>
      )}

      {/* Error State */}
      {!isLoading && queryErrors.length > 0 && (
         <div className="p-6 text-center text-red-600 bg-red-50 rounded-lg shadow border border-red-200">
             <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-3"/>
             <p className="font-medium text-lg mb-2">Error Loading Analytics</p>
             <ul className="text-sm space-y-1 list-disc list-inside">
                 {queryErrors.map((err, index) => (
                     <li key={index}>{err.message || 'An unknown error occurred.'}</li>
                 ))}
             </ul>
             <p className="text-sm mt-3">Please check your connection or try again later.</p>
         </div>
      )}

      {/* Analytics Grid (Show only if not loading and no errors) */}
      {!isLoading && queryErrors.length === 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Quiz Completions Chart */}
          <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={20} className="text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-700">Quiz Completions ({timeRange})</h2>
            </div>
            <div className="h-72 md:h-80"> {/* Fixed height container */}
              <ResponsiveContainer width="100%" height="100%">
                 {completionsData && completionsData.length > 0 ? (
                    <BarChart data={completionsData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0"/>
                      <XAxis dataKey="date" fontSize={11} tick={{ fill: '#6b7280' }} />
                      <YAxis fontSize={11} tick={{ fill: '#6b7280' }} />
                      <Tooltip contentStyle={{fontSize: '12px', borderRadius: '4px'}} />
                      <Legend wrapperStyle={{fontSize: '12px'}} />
                      {/* Ensure dataKey matches corrected key */}
                      <Bar dataKey="Completions" fill="#3b82f6" barSize={20} />
                    </BarChart>
                 ) : (
                     <div className="flex items-center justify-center h-full text-gray-500 italic">No completion data for this period.</div>
                 )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* User Activity Chart */}
          <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-green-500" />
              <h2 className="text-lg font-semibold text-gray-700">Active Users ({timeRange})</h2>
            </div>
            <div className="h-72 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                 {userActivityData && userActivityData.length > 0 ? (
                    <BarChart data={userActivityData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0"/>
                      <XAxis dataKey="date" fontSize={11} tick={{ fill: '#6b7280' }} />
                      <YAxis fontSize={11} tick={{ fill: '#6b7280' }} />
                      <Tooltip contentStyle={{fontSize: '12px', borderRadius: '4px'}}/>
                      <Legend wrapperStyle={{fontSize: '12px'}}/>
                      {/* Ensure dataKey matches corrected key */}
                      <Bar dataKey="Active Users" fill="#10b981" barSize={20}/>
                    </BarChart>
                 ) : (
                     <div className="flex items-center justify-center h-full text-gray-500 italic">No activity data for this period.</div>
                 )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Quizzes Table */}
          <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Award size={20} className="text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-700">Most Popular Quizzes (Top 10)</h2>
            </div>
            <div className="overflow-x-auto max-h-80"> {/* Max height for scroll */}
               {topQuizzesData && topQuizzesData.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0"> {/* Sticky header */}
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Title</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Completions</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Avg Score (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {topQuizzesData.map((quiz) => (
                        // *** CORRECTED KEY and DISPLAY ***
                        <tr key={quiz._id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-800">{quiz.title}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{quiz.completions}</td>
                          {/* Display percentage */}
                          <td className="px-4 py-2 text-right text-gray-600">{quiz.average_percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                     <div className="flex items-center justify-center h-64 text-gray-500 italic">No popular quiz data available.</div>
                )}
            </div>
          </div>

          {/* Category Distribution Pie Chart */}
          <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={20} className="text-purple-500" />
              <h2 className="text-lg font-semibold text-gray-700">Quiz Categories (Count)</h2>
            </div>
            <div className="h-72 md:h-80 flex items-center justify-center"> {/* Centered container */}
               {categoryData && categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius="80%"
                        fill="#8884d8"
                        // *** CORRECTED DATAKEY ***
                        dataKey="value" // Use 'value' which represents the count
                        nameKey="name"
                        // *** CORRECTED LABEL ***
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, value, name, index }) => {
                            // Simplified label: Only show if value is > 0
                            if (!value || value <= 0) return null;
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.6; // Position label inside slice
                            const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                            const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                            return (
                            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold">
                                {`${name} (${value})`} {/* Show Name and Count */}
                            </text>
                            );
                        }}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      {/* *** CORRECTED TOOLTIP FORMATTER *** */}
                      <Tooltip formatter={(value) => `${value} Quizzes`} contentStyle={{fontSize: '12px', borderRadius: '4px'}} />
                       <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}} layout="horizontal" verticalAlign="bottom" align="center"/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                     <div className="flex items-center justify-center h-full text-gray-500 italic">No category data available.</div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnalytics;
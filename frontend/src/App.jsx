// src/App.jsx

import React from 'react'; // No need for useState, useEffect here directly
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast'; // Import Toaster

// Layouts
import AdminLayout from './layouts/AdminLayout';
import UserLayout from './layouts/UserLayout';
import AuthLayout from './layouts/AuthLayout';

// --- Page Imports ---

// Pages - Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Pages - Admin
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminQuizzes from './pages/admin/AdminQuizzes';
import AdminCreateQuiz from './pages/admin/AdminCreateQuiz';
import AdminQuizReview from './pages/admin/AdminQuizReview';
import AdminAnalytics from './pages/admin/AdminAnalytics';

// Pages - User
import UserDashboard from './pages/user/UserDashboard';
import UserUpcomingQuizzes from './pages/user/UserUpcomingQuizzes';
import UserHistory from './pages/user/UserHistory';
import UserProfile from './pages/user/UserProfile';
import UserQuizAttempt from './pages/user/UserQuizAttempt';
import UserQuizResults from './pages/user/UserQuizResults';
// Assuming you might add a Leaderboard page
import LeaderboardPage from './pages/shared/LeaderBoardPage';
// --- Auth Provider and Hook ---
import { AuthProvider, useAuth } from './contexts/AuthContext';

// --- React Query Client ---
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Example: disable refetch on window focus
      retry: 1,                 // Example: retry failed requests once
    },
  },
});

// --- UI Components ---

// Centralized Loading UI for route protection checks
const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen bg-gray-100">
    <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// --- Protected Route Components ---

// Admin Protected Route
const AdminRoute = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
      // Show loading screen while checking auth status
      return <LoadingScreen />;
  }

  if (!token || !user) {
      // Not authenticated, redirect to login
      return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
     // Authenticated but not authorized, redirect to user dashboard (or a specific 'unauthorized' page)
     console.warn("Access denied: User is not an admin.");
     return <Navigate to="/user" replace />;
  }

  // Authenticated and authorized as admin
  return children;
};

// User Protected Route
const UserRoute = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
     // Show loading screen while checking auth status
     return <LoadingScreen />;
  }

  if (!token || !user) {
     // Not authenticated, redirect to login
     return <Navigate to="/login" replace />;
  }

  // Any authenticated user (admin or user) can access user routes
  return children;
};


// --- Main App Component ---

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* === React Hot Toast Provider === */}
        <Toaster
           position="top-center"
           reverseOrder={false}
           gutter={8}
           containerClassName=""
           containerStyle={{}}
           toastOptions={{
              // Define default options
              className: '',
              duration: 5000, // Default duration 5s
              style: {
                background: '#333', // Dark background
                color: '#fff',    // White text
                fontSize: '14px', // Slightly smaller font
              },
              // Default options for specific types
              success: {
                duration: 3000, // Success messages shorter
                // iconTheme: { primary: '#10B981', secondary: 'white' }, // Example theme
              },
              error: {
                 duration: 6000, // Error messages longer
                 // iconTheme: { primary: '#EF4444', secondary: 'white' }, // Example theme
              },
           }}
        />
        {/* =============================== */}

        <Router>
          <Routes>
            {/* --- Authentication Routes --- */}
            {/* These routes use the AuthLayout for pages like login/register */}
            <Route path="/" element={<AuthLayout />}>
              {/* Redirect base path to login */}
              <Route index element={<Navigate to="/login" replace />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
            </Route>

            {/* --- Admin Routes --- */}
            {/* These routes are protected by AdminRoute and use AdminLayout */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="quizzes" element={<AdminQuizzes />} />
              <Route path="create-quiz" element={<AdminCreateQuiz />} />
              {/* Ensure quizId is passed correctly */}
              <Route path="review-quiz/:quizId" element={<AdminQuizReview />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              {/* Add other admin-specific routes here */}
            </Route>

            {/* --- User Routes --- */}
            {/* These routes are protected by UserRoute and use UserLayout */}
            <Route
              path="/user"
              element={
                <UserRoute>
                  <UserLayout />
                </UserRoute>
              }
            >
              <Route index element={<UserDashboard />} />
              <Route path="upcoming" element={<UserUpcomingQuizzes />} />
              <Route path="history" element={<UserHistory />} />
              <Route path="profile" element={<UserProfile />} />
              {/* Ensure quizId is passed correctly */}
              <Route path="quiz/:quizId" element={<UserQuizAttempt />} />
              {/* Ensure quizId/submissionId is passed correctly */}
              <Route path="results/:quizId" element={<UserQuizResults />} />
              {/* Add other user-specific routes here */}
            </Route>

            {/* --- Shared/Public Routes (Optional) --- */}
            {/* Example: A public leaderboard page */}
            {/* <Route path="/leaderboard/:quizId" element={<LeaderboardPage />} /> */}
            <Route
                path="/quiz/leaderboard/:quizId" // Frontend path
                element={
                    <UserRoute> {/* Or wrap in a different Layout/Protection if needed */}
                        <LeaderboardPage />
                    </UserRoute>
                }
            />

            {/* --- Fallback Route --- */}
            {/* Redirect any unmatched paths to login (or a 404 page) */}
            <Route path="*" element={<Navigate to="/login" replace />} />

          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
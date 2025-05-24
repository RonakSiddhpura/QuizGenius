// src/pages/admin/AdminCreateQuiz.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Helper function to get base URL from environment variables
const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'; // Use Vite env variable
};

// --- Axios Instance ---
// Create an Axios instance for API calls. This is often cleaner than setting global defaults.
const apiClient = axios.create({
    baseURL: getApiBaseUrl(), // Set base URL for '/api' routes
    timeout: 10000, // Optional: Set request timeout
    headers: {
        'Content-Type': 'application/json',
    }
});

// --- Auth Context ---
const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// --- Auth Provider Component ---
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token')); // Initialize from localStorage
    const [isLoading, setIsLoading] = useState(true); // Start as true to check auth status
    const [error, setError] = useState(null); // State for login/register/auth check errors

    // --- Effect to check authentication status on load ---
    useEffect(() => {
        const checkAuthStatus = async () => {
            if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
                console.log("AuthProvider: No valid token found initially.");
                localStorage.removeItem('token');
                setToken(null);
                setUser(null);
                setIsLoading(false);
                return;
            }

            console.log("AuthProvider: Found token, attempting to verify...");
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`; // Set header for this check

            try {
                const response = await apiClient.get('/api/user'); // Use relative path with instance baseURL
                console.log("✅ AuthProvider: Auth check successful:", response.data);
                setUser(response.data.user);
                // Token is already set from initial state or previous login/register
            } catch (err) {
                console.error('❌ AuthProvider: Auth check failed:', err.response?.data || err.message);
                localStorage.removeItem('token');
                delete apiClient.defaults.headers.common['Authorization'];
                setUser(null);
                setToken(null);
                // Optionally set an error state if needed, but usually just logging out is sufficient
                // setError("Session expired or invalid. Please log in again.");
            } finally {
                setIsLoading(false);
            }
        };

        checkAuthStatus();
    }, [token]); // Rerun check if token changes (e.g., after login) - although login/register handle this too

    // --- Authentication Functions ---

    const login = useCallback(async (email, password) => {
        setError(null); // Clear previous errors
        setIsLoading(true); // Indicate loading during login attempt
        try {
            const response = await apiClient.post('/api/login', { email, password });
            const { access_token, user: loggedInUser } = response.data;

            localStorage.setItem('token', access_token);
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`; // Set header for subsequent requests

            setToken(access_token);
            setUser(loggedInUser);
            setIsLoading(false);
            console.log("✅ AuthProvider: Login successful");
            return { success: true, user: loggedInUser }; // Return success status and user
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Login failed. Please check credentials.';
            console.error('❌ AuthProvider: Login failed:', errorMsg);
            setError(errorMsg);
            setIsLoading(false);
            return { success: false, error: errorMsg }; // Return failure status and error
        }
    }, []); // useCallback prevents recreation on every render

    const register = useCallback(async (name, email, password) => {
        setError(null);
        setIsLoading(true);
        try {
            const response = await apiClient.post('/api/register', { name, email, password });
            const { access_token, user: registeredUser } = response.data;

            localStorage.setItem('token', access_token);
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

            setToken(access_token);
            setUser(registeredUser);
            setIsLoading(false);
            console.log("✅ AuthProvider: Registration successful");
            return { success: true, user: registeredUser };
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Registration failed. Please try again.';
            console.error('❌ AuthProvider: Registration failed:', errorMsg);
            setError(errorMsg);
            setIsLoading(false);
            return { success: false, error: errorMsg };
        }
    }, []);

    const logout = useCallback(() => {
        console.log("AuthProvider: Logging out...");
        localStorage.removeItem('token');
        delete apiClient.defaults.headers.common['Authorization'];
        setUser(null);
        setToken(null);
        setError(null); // Clear any errors on logout
        // Optionally navigate here or let the consuming component handle it
        // navigate('/login');
    }, []);

    // --- Context Value ---
    // Use useMemo to prevent unnecessary re-renders if value object doesn't change
    const value = React.useMemo(() => ({
        user,
        token,
        isLoading,
        error,
        setError, // Expose setError to allow components to clear errors if needed
        login,
        register,
        logout
    }), [user, token, isLoading, error, login, register, logout]);

    // Render children only after the initial auth check is complete
    return (
        <AuthContext.Provider value={value}>
            {!isLoading ? children : null /* Or render a loading spinner */}
        </AuthContext.Provider>
    );
};

// Export the instance if needed elsewhere, or just rely on useAuth hook
export { apiClient }
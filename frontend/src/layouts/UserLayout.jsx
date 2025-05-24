

// src/layouts/UserLayout.jsx
import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Menu,
  X,
  LayoutDashboard,
  Calendar,
  History,
  User as UserIcon, // Renamed User to avoid conflict
  LogOut,
  Book // Assuming Book is your logo icon
} from 'lucide-react';

// Navigation items for User
const navigation = [
    { name: 'Dashboard', href: '/user', icon: LayoutDashboard },
    { name: 'Upcoming Quizzes', href: '/user/upcoming', icon: Calendar },
    { name: 'My History', href: '/user/history', icon: History },
    { name: 'Profile', href: '/user/profile', icon: UserIcon },
];

// Reusable SidebarNav component (same as AdminLayout)
function SidebarNav() {
  return (
    <nav className="mt-5 flex-1 px-2 space-y-1">
      {navigation.map((item) => (
        <NavLink
          key={item.name}
          to={item.href}
          end // Add 'end' prop for exact matching on index routes like /user
          className={({ isActive }) =>
            `group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-150 ${
              isActive
                ? 'bg-indigo-900 text-white shadow-inner'
                : 'text-indigo-100 hover:bg-indigo-700 hover:text-white'
            }`
          }
        >
          <item.icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          {item.name}
        </NavLink>
      ))}
    </nav>
  );
}

// Reusable UserProfile component (same as AdminLayout)
function UserProfile({ user, onLogout }) {
  return (
     <div className="flex-shrink-0 flex border-t border-indigo-700 p-4">
        <button
          onClick={onLogout}
          className="flex-shrink-0 w-full group block focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-800 focus:ring-white rounded-md"
        >
            <div className="flex items-center">
                {/* Optional: Add Avatar here */}
                <div className="ml-3 text-left">
                    <p className="text-sm font-medium text-white">{user?.name || 'Quiz Taker'}</p>
                    <p className="text-xs font-medium text-indigo-300 group-hover:text-indigo-100 flex items-center">
                        <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Sign out
                    </p>
                </div>
            </div>
        </button>
     </div>
  );
}


export default function UserLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth(); // Assuming useAuth provides user object
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true }); // Use replace
  };

   // Identical structure to AdminLayout, just different navigation items
  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* --- Mobile Sidebar --- */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`} role="dialog" aria-modal="true">
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ease-linear duration-300" aria-hidden="true" onClick={() => setSidebarOpen(false)}></div>
        <div className="relative flex-1 flex flex-col max-w-xs w-full pt-5 pb-4 bg-indigo-800">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sr-only">Close sidebar</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center flex-shrink-0 px-4">
            <Book className="h-8 w-auto text-white" aria-hidden="true"/>
            <span className="ml-2 text-white text-xl font-semibold">QuizGenius</span>
          </div>
          <div className="mt-5 flex-1 h-0 overflow-y-auto">
             <SidebarNav /> {/* Use the navigation specific to User */}
          </div>
          <UserProfile user={user} onLogout={handleLogout} />
        </div>
        <div className="flex-shrink-0 w-14" aria-hidden="true"></div>
      </div>

      {/* --- Static Sidebar for Desktop --- */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col flex-grow bg-indigo-800 pt-5 pb-4 overflow-y-auto">
             <div className="flex items-center flex-shrink-0 px-4">
                <Book className="h-8 w-auto text-white" aria-hidden="true"/>
                <span className="ml-2 text-white text-xl font-semibold">QuizGenius</span>
             </div>
             <div className="mt-5 flex-1 flex flex-col">
                <SidebarNav /> {/* Use the navigation specific to User */}
             </div>
             <UserProfile user={user} onLogout={handleLogout} />
          </div>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
         {/* Mobile Top Bar */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow md:hidden">
          <button
            type="button"
            className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
           <div className="flex-1 px-4 flex justify-between">
                <div className="flex-1 flex"></div>
           </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
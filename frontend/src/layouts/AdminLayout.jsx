

// src/layouts/AdminLayout.jsx
import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Menu,
  X,
  LayoutDashboard,
  Users,
  FileText,
  PlusCircle,
  BarChart4,
  LogOut,
  Book // Assuming Book is your logo icon
} from 'lucide-react';

// Navigation items for Admin
const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Quizzes', href: '/admin/quizzes', icon: FileText },
    { name: 'Create Quiz', href: '/admin/create-quiz', icon: PlusCircle },
    { name: 'Analytics', href: '/admin/analytics', icon: BarChart4 },
];

function SidebarNav() {
  return (
    <nav className="mt-5 flex-1 px-2 space-y-1">
      {navigation.map((item) => (
        <NavLink
          key={item.name}
          to={item.href}
          end // Add 'end' prop for exact matching on index routes like /admin
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

function UserProfile({ user, onLogout }) {
  return (
     <div className="flex-shrink-0 flex border-t border-indigo-700 p-4">
        <button
          onClick={onLogout}
          className="flex-shrink-0 w-full group block focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-800 focus:ring-white rounded-md"
        >
            <div className="flex items-center">
                {/* Optional: Add Avatar here */}
                {/* <div> <img className="inline-block h-9 w-9 rounded-full" src={user?.avatarUrl || defaultAvatar} alt=""/> </div> */}
                <div className="ml-3 text-left">
                    <p className="text-sm font-medium text-white">{user?.name || 'Admin User'}</p>
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

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true }); // Use replace for better history stack
  };

  return (
    // Using min-h-screen and h-screen might be redundant, min-h-screen usually suffices
    <div className="min-h-screen flex bg-gray-100">
      {/* --- Mobile Sidebar --- */}
      {/* Off-canvas menu */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`} role="dialog" aria-modal="true">
         {/* Overlay */}
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ease-linear duration-300" aria-hidden="true" onClick={() => setSidebarOpen(false)}></div>

        {/* Sidebar Panel */}
        <div className="relative flex-1 flex flex-col max-w-xs w-full pt-5 pb-4 bg-indigo-800">
          {/* Close Button */}
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

          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4">
            <Book className="h-8 w-auto text-white" aria-hidden="true"/>
            <span className="ml-2 text-white text-xl font-semibold">QuizGenius</span>
          </div>

          {/* Navigation */}
          <div className="mt-5 flex-1 h-0 overflow-y-auto">
             <SidebarNav />
          </div>

          {/* User Profile / Logout */}
          <UserProfile user={user} onLogout={handleLogout} />
        </div>
        <div className="flex-shrink-0 w-14" aria-hidden="true">{/* Dummy element to force sidebar to shrink to fit close icon */}</div>
      </div>

      {/* --- Static Sidebar for Desktop --- */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col flex-grow bg-indigo-800 pt-5 pb-4 overflow-y-auto">
             {/* Logo */}
             <div className="flex items-center flex-shrink-0 px-4">
                <Book className="h-8 w-auto text-white" aria-hidden="true"/>
                <span className="ml-2 text-white text-xl font-semibold">QuizGenius</span>
             </div>
             {/* Navigation */}
             <div className="mt-5 flex-1 flex flex-col">
                <SidebarNav />
             </div>
             {/* User Profile / Logout */}
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
           {/* Can add search or other top bar elements here if needed */}
           <div className="flex-1 px-4 flex justify-between">
                {/* Placeholder for potential top bar content */}
                <div className="flex-1 flex"></div>
           </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            {/* Using max-w-7xl for consistency, adjust if needed */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Content goes here */}
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
// App.jsx
// Updated with Supabase authentication + Lazada account check + Data Sync

import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useState, useEffect, createContext, useContext } from "react";
import { auth, supabase } from "./lib/supabase";
import { AccountManager } from "./utils/AccountManager";

// Pages
import Login from "./Auth/Login";
import LazadaAuth from "./pages/LazadaAuth";
import Callback from "./pages/Callback";
import Dashboard from "./pages/Dashboard";
import OrderItems from "./pages/OrderItems";
import Ffr from "./pages/Ffr";
import DataInsights from "./pages/DataInsights";
import SyncDashboard from "./components/SyncDashboard";

// Components
import Sidebar from "./components/Sidebar";
import { TopNav } from "./components/TopNav";

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ============================================
// AUTH CONTEXT
// ============================================

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// Auth Provider Component
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lazadaAccounts, setLazadaAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Fetch Lazada accounts when user is authenticated
  const fetchLazadaAccounts = async () => {
    if (!session) {
      setLazadaAccounts([]);
      return;
    }

    setAccountsLoading(true);
    try {
      const accounts = await AccountManager.getAccounts(true);
      setLazadaAccounts(accounts);
    } catch (error) {
      console.error('Failed to fetch Lazada accounts:', error);
      setLazadaAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  };

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { session } = await auth.getSession();
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user || null);

        if (event === 'SIGNED_OUT') {
          // Clear account data on sign out
          await AccountManager.clearAll();
          setLazadaAccounts([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch Lazada accounts when session changes
  useEffect(() => {
    if (session) {
      fetchLazadaAccounts();
    }
  }, [session]);

  const signOut = async () => {
    await AccountManager.clearAll();
    await auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    signOut,
    isAuthenticated: !!session,
    lazadaAccounts,
    accountsLoading,
    hasLazadaAccounts: lazadaAccounts.length > 0,
    refreshLazadaAccounts: fetchLazadaAccounts,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================
// LAYOUT COMPONENT
// ============================================

function Layout({ children }) {
  const location = useLocation();
  const { isAuthenticated, signOut, loading } = useAuth();
  
  // Pages that don't need sidebar
  const authPages = ['/', '/login', '/callback', '/lazada-auth'];
  const isAuthPage = authPages.includes(location.pathname);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Don't show sidebar/topnav on auth pages
  if (isAuthPage || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top Navigation */}
        <TopNav onLogout={signOut} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ============================================
// ROUTE GUARDS
// ============================================

// Protected Route Component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Protected Route that also requires Lazada account
function ProtectedRouteWithLazada({ children }) {
  const { isAuthenticated, loading, hasLazadaAccounts, accountsLoading } = useAuth();
  const location = useLocation();

  if (loading || accountsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If no Lazada accounts, redirect to connect one
  if (!hasLazadaAccounts) {
    return <Navigate to="/lazada-auth" state={{ from: location }} replace />;
  }

  return children;
}

// Public Route - redirect to appropriate page if already logged in
function PublicRoute({ children }) {
  const { isAuthenticated, loading, hasLazadaAccounts, accountsLoading } = useAuth();

  if (loading || accountsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    // If logged in but no Lazada accounts, go to connect page
    if (!hasLazadaAccounts) {
      return <Navigate to="/lazada-auth" replace />;
    }
    // Otherwise go to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// ============================================
// APP ROUTES
// ============================================

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* Lazada OAuth - requires user to be logged in */}
        <Route
          path="/lazada-auth"
          element={
            <ProtectedRoute>
              <LazadaAuth apiUrl={API_URL} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/callback"
          element={
            <ProtectedRoute>
              <Callback apiUrl={API_URL} />
            </ProtectedRoute>
          }
        />

        {/* Protected Routes - require both login AND Lazada account */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRouteWithLazada>
              <Dashboard apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRouteWithLazada>
              <OrderItems apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        <Route
          path="/ffr"
          element={
            <ProtectedRouteWithLazada>
              <Ffr apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        <Route
          path="/data_insights"
          element={
            <ProtectedRouteWithLazada>
              <DataInsights apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        
        {/* Data Sync Dashboard */}
        <Route
          path="/sync"
          element={
            <ProtectedRouteWithLazada>
              <SyncDashboard />
            </ProtectedRouteWithLazada>
          }
        />
        
        <Route
          path="/settings"
          element={
            <ProtectedRouteWithLazada>
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Settings</h2>
                <p className="text-gray-600">Settings page coming soon...</p>
              </div>
            </ProtectedRouteWithLazada>
          }
        />

        {/* 404 Redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Layout>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================

function App() {
  return (
    <BrowserRouter basename="/cll">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
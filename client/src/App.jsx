// App.jsx
// Updated with Supabase authentication + Lazada account check + Data Sync + Role-Based Access Control

import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useState, useEffect, createContext, useContext, useCallback } from "react";
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
import Settings from "./pages/Settings";
import UserCreation from "./pages/UserCreation";

// Components
import Sidebar from "./components/Sidebar";
import { TopNav } from "./components/TopNav";

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ============================================
// ROLE PERMISSIONS CONFIGURATION
// ============================================

const ROLE_PERMISSIONS = {
  admin: {
    pages: ['dashboard', 'orders', 'ffr', 'data_insights', 'sync', 'settings', 'users'],
    canAddStore: true,
    canManageUsers: true,
    canSync: true,
    canExport: true,
    canDeleteData: true,
  },
  warehouse: {
    pages: ['orders', 'ffr'],
    canAddStore: false,
    canManageUsers: false,
    canSync: true,
    canExport: true,
    canDeleteData: false,
  },
  marketing: {
    pages: ['data_insights'],
    canAddStore: false,
    canManageUsers: false,
    canSync: true,
    canExport: true,
    canDeleteData: false,
  },
};

// ============================================
// AUTH CONTEXT (with Role Support)
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
  
  // Role state
  const [userProfile, setUserProfile] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Fetch user profile with role
  const fetchUserProfile = useCallback(async (userId) => {
    if (!userId) {
      setUserProfile(null);
      setRoleLoading(false);
      return;
    }

    setRoleLoading(true);
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // If no profile exists, create one with default role
        if (error.code === 'PGRST116') {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: newProfile, error: createError } = await supabase
              .from('user_profiles')
              .insert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email.split('@')[0],
                role: 'warehouse', // Default role
              })
              .select()
              .single();

            if (!createError) {
              setUserProfile(newProfile);
            }
          }
        } else {
          console.error('Error fetching profile:', error);
        }
      } else {
        setUserProfile(profile);
      }
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
    } finally {
      setRoleLoading(false);
    }
  }, []);

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
      
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        setRoleLoading(false);
      }
      
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user || null);

        if (event === 'SIGNED_IN' && session?.user) {
          await fetchUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          // Clear account data on sign out
          await AccountManager.clearAll();
          setLazadaAccounts([]);
          setUserProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

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

  // Role helper functions
  const role = userProfile?.role || null;
  const permissions = role ? ROLE_PERMISSIONS[role] : null;

  const hasPageAccess = useCallback((pageName) => {
    if (!permissions) return false;
    return permissions.pages.includes(pageName);
  }, [permissions]);

  const hasPermission = useCallback((permissionName) => {
    if (!permissions) return false;
    return permissions[permissionName] === true;
  }, [permissions]);

  const isAdmin = role === 'admin';
  const isWarehouse = role === 'warehouse';
  const isMarketing = role === 'marketing';

  const getDefaultPath = useCallback(() => {
    if (!permissions || permissions.pages.length === 0) return '/login';
    const firstPage = permissions.pages[0];
    return `/${firstPage}`;
  }, [permissions]);

  const value = {
    // Auth
    user,
    session,
    loading,
    signOut,
    isAuthenticated: !!session,
    
    // Lazada accounts
    lazadaAccounts,
    accountsLoading,
    hasLazadaAccounts: lazadaAccounts.length > 0,
    refreshLazadaAccounts: fetchLazadaAccounts,
    
    // Role-based access
    userProfile,
    role,
    permissions,
    roleLoading,
    isAdmin,
    isWarehouse,
    isMarketing,
    hasPageAccess,
    hasPermission,
    getDefaultPath,
    refreshUserProfile: () => fetchUserProfile(user?.id),
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

// Protected Route that also requires Lazada account AND role access
function ProtectedRouteWithLazada({ children, requiredPage }) {
  const { 
    isAuthenticated, 
    loading, 
    hasLazadaAccounts, 
    accountsLoading,
    roleLoading,
    hasPageAccess,
    getDefaultPath,
    isAdmin
  } = useAuth();
  const location = useLocation();

  if (loading || accountsLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (requiredPage && !hasPageAccess(requiredPage)) {
    return <Navigate to={getDefaultPath()} replace />;
  }

  // If no Lazada accounts and user is admin, redirect to connect one
  // Non-admins can still view pages without Lazada accounts (they just won't see data)
  if (!hasLazadaAccounts && isAdmin && location.pathname !== '/lazada-auth') {
    return <Navigate to="/lazada-auth" state={{ from: location }} replace />;
  }

  return children;
}

// Admin-only Route
function AdminRoute({ children }) {
  const { isAuthenticated, loading, roleLoading, isAdmin, getDefaultPath } = useAuth();
  const location = useLocation();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to={getDefaultPath()} replace />;
  }

  return children;
}

// Public Route - redirect to appropriate page if already logged in
function PublicRoute({ children }) {
  const { isAuthenticated, loading, hasLazadaAccounts, accountsLoading, roleLoading, getDefaultPath, isAdmin } = useAuth();

  if (loading || accountsLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    // If logged in but no Lazada accounts and is admin, go to connect page
    if (!hasLazadaAccounts && isAdmin) {
      return <Navigate to="/lazada-auth" replace />;
    }
    // Otherwise go to default page based on role
    return <Navigate to={getDefaultPath()} replace />;
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

        {/* Lazada OAuth - requires admin role */}
        <Route
          path="/lazada-auth"
          element={
            <AdminRoute>
              <LazadaAuth apiUrl={API_URL} />
            </AdminRoute>
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

        {/* Protected Routes - require login, Lazada account, AND role access */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRouteWithLazada requiredPage="dashboard">
              <Dashboard apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRouteWithLazada requiredPage="orders">
              <OrderItems apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        <Route
          path="/ffr"
          element={
            <ProtectedRouteWithLazada requiredPage="ffr">
              <Ffr apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        <Route
          path="/data_insights"
          element={
            <ProtectedRouteWithLazada requiredPage="data_insights">
              <DataInsights apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />
        
        {/* Data Sync Dashboard */}
        <Route
          path="/sync"
          element={
            <ProtectedRouteWithLazada requiredPage="sync">
              <SyncDashboard />
            </ProtectedRouteWithLazada>
          }
        />
        
        {/* Settings - Admin only for store management */}
        <Route
          path="/settings"
          element={
            <ProtectedRouteWithLazada requiredPage="settings">
              <Settings apiUrl={API_URL} />
            </ProtectedRouteWithLazada>
          }
        />

        {/* User Management - Admin only */}
        <Route
          path="/users"
          element={
            <AdminRoute>
              <UserCreation />
            </AdminRoute>
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
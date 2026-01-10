// ============================================
// ROLE-BASED ACCESS CONTROL CONTEXT
// File: src/contexts/RoleContext.jsx
// ============================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Define permissions for each role
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

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch user profile with role
  const fetchUserProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        // If no profile exists, create one with default role
        if (profileError.code === 'PGRST116') {
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

          if (createError) {
            console.error('Error creating profile:', createError);
            setError('Failed to create user profile');
          } else {
            setUserProfile(newProfile);
          }
        } else {
          console.error('Error fetching profile:', profileError);
          setError('Failed to fetch user profile');
        }
      } else {
        setUserProfile(profile);
      }
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for auth changes
  useEffect(() => {
    fetchUserProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchUserProfile();
      } else if (event === 'SIGNED_OUT') {
        setUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  // Get current role
  const role = userProfile?.role || null;

  // Get permissions for current role
  const permissions = role ? ROLE_PERMISSIONS[role] : null;

  // Check if user has access to a specific page
  const hasPageAccess = useCallback((pageName) => {
    if (!permissions) return false;
    return permissions.pages.includes(pageName);
  }, [permissions]);

  // Check if user has a specific permission
  const hasPermission = useCallback((permissionName) => {
    if (!permissions) return false;
    return permissions[permissionName] === true;
  }, [permissions]);

  // Check if user is admin
  const isAdmin = role === 'admin';

  // Check if user is warehouse
  const isWarehouse = role === 'warehouse';

  // Check if user is marketing
  const isMarketing = role === 'marketing';

  // Get allowed pages for sidebar
  const getAllowedPages = useCallback(() => {
    if (!permissions) return [];
    return permissions.pages;
  }, [permissions]);

  // Get redirect path based on role (for unauthorized access)
  const getDefaultPath = useCallback(() => {
    if (!permissions || permissions.pages.length === 0) return '/login';
    const firstPage = permissions.pages[0];
    return `/${firstPage}`;
  }, [permissions]);

  const value = {
    userProfile,
    role,
    permissions,
    loading,
    error,
    isAdmin,
    isWarehouse,
    isMarketing,
    hasPageAccess,
    hasPermission,
    getAllowedPages,
    getDefaultPath,
    refreshProfile: fetchUserProfile,
  };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

// Hook to use role context
export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

export default RoleContext;
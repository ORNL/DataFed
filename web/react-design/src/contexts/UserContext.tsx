import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User } from "../types/models";
import dataFedApi from "../services/api";

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (userId: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

/**
 * Provider component for user context
 */
export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load user on initial mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await dataFedApi.getCurrentUser();

        if (response.success && response.data) {
          setUser(response.data);
        } else {
          // User not logged in or error
          setUser(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load user");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  /**
   * Login with user ID
   * @param userId User ID to login with
   * @returns Promise resolving to success status
   */
  const login = async (userId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await dataFedApi.getUser(userId, true);

      if (response.success && response.data) {
        setUser(response.data);
        return true;
      } else {
        setError(response.error || "Failed to login");
        return false;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Logout current user
   */
  const logout = () => {
    setUser(null);
    // In a real implementation, we would also call an API endpoint to invalidate the session
    window.location.href = "/ui/logout";
  };

  /**
   * Refresh user data
   */
  const refreshUser = async (): Promise<void> => {
    if (!user) return;

    try {
      const response = await dataFedApi.getUser(user.uid, true);

      if (response.success && response.data) {
        setUser(response.data);
      }
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    refreshUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

/**
 * Hook for using the user context
 * @returns User context
 */
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }

  return context;
};

export default UserContext;

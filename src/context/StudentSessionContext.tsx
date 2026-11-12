/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, StudentSessionData } from '../types.js';

interface StudentSessionContextType {
  sessionData: StudentSessionData | null;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  lastSyncTimestamp: number | null;
  initSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateSessionData: (updater: (prev: StudentSessionData) => StudentSessionData) => void;
  clearSession: () => void;
}

const StudentSessionContext = createContext<StudentSessionContextType | null>(null);

interface StudentSessionProviderProps {
  currentUser: User | null;
  children: React.ReactNode;
}

export const StudentSessionProvider: React.FC<StudentSessionProviderProps> = ({ currentUser, children }) => {
  const [sessionData, setSessionData] = useState<StudentSessionData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);

  const currentStudentIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchSessionData = useCallback(async (studentId: string, isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!isSilent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      if (!currentUser?.sessionToken) {
        console.warn('[StudentSessionContext] No se dispone de sessionToken para el alumno. Limpiando credenciales locales.');
        try {
          localStorage.removeItem('bes_sim_user');
        } catch (e) {}
        window.dispatchEvent(new Event('auth:unauthorized'));
        setIsLoading(false);
        isFetchingRef.current = false;
        return;
      }

      const headers: Record<string, string> = {
        'x-student-id': studentId,
        'x-session-token': currentUser.sessionToken,
        'Authorization': `Bearer ${currentUser.sessionToken}`
      };

      const res = await fetch(`/api/student/session-init?studentId=${encodeURIComponent(studentId)}`, {
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          console.warn('[StudentSessionContext] Sesión no válida o expirada (HTTP 401). Limpiando credenciales locales para requerir nuevo inicio de sesión.');
          try {
            localStorage.removeItem('bes_sim_user');
          } catch (e) {}
          setSessionData(null);
          setIsLoaded(false);
          window.dispatchEvent(new Event('auth:unauthorized'));
          setIsLoading(false);
          isFetchingRef.current = false;
          return;
        }
        throw new Error(errorData.error || `Error del servidor (${res.status}) al cargar la sesión del alumno.`);
      }

      const data = await res.json();
      if (!data || !data.success || !data.sessionData) {
        throw new Error('Estructura de datos de sesión inválida devuelta por el servidor.');
      }

      setSessionData(data.sessionData);
      setIsLoaded(true);
      setLastSyncTimestamp(Date.now());
      setError(null);
    } catch (err: any) {
      console.error('[StudentSessionContext] Error cargando datos iniciales:', err);
      setError(err.message || 'Error de comunicación al sincronizar los datos de la sesión.');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [currentUser?.sessionToken]);

  // Monitor currentUser changes: load on student login, clear on logout or user switch
  useEffect(() => {
    if (currentUser && currentUser.role === 'student') {
      const targetId = currentUser.id;
      // If user switched or not loaded yet
      if (currentStudentIdRef.current !== targetId) {
        currentStudentIdRef.current = targetId;
        setSessionData(null);
        setIsLoaded(false);
        setError(null);
        fetchSessionData(targetId, false);
      }
    } else {
      // Not a student or logged out -> clear session
      currentStudentIdRef.current = null;
      setSessionData(null);
      setIsLoaded(false);
      setIsLoading(false);
      setError(null);
      setLastSyncTimestamp(null);
    }
  }, [currentUser?.id, currentUser?.role, fetchSessionData]);

  const initSession = useCallback(async () => {
    if (currentUser && currentUser.role === 'student') {
      await fetchSessionData(currentUser.id, false);
    }
  }, [currentUser, fetchSessionData]);

  const refreshSession = useCallback(async () => {
    if (currentUser && currentUser.role === 'student') {
      await fetchSessionData(currentUser.id, true);
    }
  }, [currentUser, fetchSessionData]);

  const updateSessionData = useCallback((updater: (prev: StudentSessionData) => StudentSessionData) => {
    setSessionData((prev) => {
      if (!prev) return null;
      const updated = updater(prev);
      return updated;
    });
    setLastSyncTimestamp(Date.now());
  }, []);

  const clearSession = useCallback(() => {
    currentStudentIdRef.current = null;
    setSessionData(null);
    setIsLoaded(false);
    setIsLoading(false);
    setError(null);
    setLastSyncTimestamp(null);
  }, []);

  return (
    <StudentSessionContext.Provider
      value={{
        sessionData,
        isLoaded,
        isLoading,
        error,
        lastSyncTimestamp,
        initSession,
        refreshSession,
        updateSessionData,
        clearSession,
      }}
    >
      {children}
    </StudentSessionContext.Provider>
  );
};

export const useStudentSession = (): StudentSessionContextType => {
  const context = useContext(StudentSessionContext);
  if (!context) {
    throw new Error('useStudentSession debe utilizarse dentro de un <StudentSessionProvider>.');
  }
  return context;
};

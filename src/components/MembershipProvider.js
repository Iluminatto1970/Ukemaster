// src/components/MembershipProvider.js
import React, { createContext, useContext, useState, useEffect } from 'react';
// import { auth, db } from '../utils/firebase';

const MembershipContext = createContext();

export const MembershipProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Exemplo de integração: substituir com Firebase Auth real
    // const unsubscribe = auth.onAuthStateChanged(async (currentUser) => { ... });
    setLoading(false); // mock para teste
  }, []);

  return (
    <MembershipContext.Provider value={{ user, isPremium, loading }}>
      {children}
    </MembershipContext.Provider>
  );
};

export const useMembership = () => useContext(MembershipContext);

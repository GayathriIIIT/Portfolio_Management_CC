import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

function getInitialTheme() {
  const saved = localStorage.getItem('pm_theme');
  if (saved === 'light' || saved === 'dark') return 'professional';
  if (saved === 'brainrot' || saved === 'professional') return saved;
  return 'professional';
}

function getInitialColorScheme() {
  const saved = localStorage.getItem('pm_theme');
  if (saved === 'light' || saved === 'dark') {
    return saved === 'dark' ? 'dark' : 'light';
  }
  const scheme = localStorage.getItem('pm_scheme');
  return scheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [colorScheme, setColorScheme] = useState(getInitialColorScheme);

  const dataTheme = colorScheme === 'dark' ? `${theme}-dark` : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dataTheme);
    localStorage.setItem('pm_theme', theme);
    localStorage.setItem('pm_scheme', colorScheme);
  }, [dataTheme, theme, colorScheme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'professional' ? 'brainrot' : 'professional'));
  };

  const toggleColorScheme = () => {
    setColorScheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const isBrainrot = theme === 'brainrot';
  const isDark = colorScheme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, isBrainrot, isDark, toggleTheme, toggleColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

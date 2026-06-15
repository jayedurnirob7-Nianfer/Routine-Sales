'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSiteSettings, saveSiteSettings } from '@/lib/store';
import { SiteSettings } from '@/types';

interface SettingsCtx {
  settings: SiteSettings;
  updateSettings(s: SiteSettings): Promise<void>;
}
const Ctx = createContext<SettingsCtx>({
  settings: { siteName: 'PXL_Sales_Routine', logoEmoji: '⬡' },
  updateSettings: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>({ siteName: 'PXL_Sales_Routine', logoEmoji: '⬡' });

  useEffect(() => {
    getSiteSettings().then(setSettings);
  }, []);

  async function updateSettings(s: SiteSettings) {
    await saveSiteSettings(s);
    setSettings(s);
  }

  return <Ctx.Provider value={{ settings, updateSettings }}>{children}</Ctx.Provider>;
}

export function useSettings() { return useContext(Ctx); }

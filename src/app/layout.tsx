import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { SettingsProvider } from '@/lib/settings';
import Nav from '@/components/shared/Nav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PXL Sales Routine',
  description: 'Sales team shift schedule manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen`}>
        <SettingsProvider>
          <AuthProvider>
            <Nav />
            <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}

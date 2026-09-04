import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TreeServ Geo｜案場工作紀錄',
  description: '以地圖保存每個案場的工作紀錄、注意事項與交接附件。',
  openGraph: {
    title: 'TreeServ Geo｜案場工作紀錄',
    description: '交接不再只靠記憶。以地圖保存案場工作、注意事項與附件。',
    type: 'website',
    locale: 'zh_TW',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TreeServ Geo 案場工作紀錄' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TreeServ Geo｜案場工作紀錄',
    description: '交接不再只靠記憶。以地圖保存案場工作、注意事項與附件。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

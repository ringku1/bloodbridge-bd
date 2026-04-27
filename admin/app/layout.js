import './globals.css';

export const metadata = {
  title: 'Blood Bridge Admin',
  description: 'Admin dashboard for Blood Bridge',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}

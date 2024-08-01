import './globals.css'

export const metadata = {
  title: 'EDURange WebOS',
  description: 'EDURange Cloud WebOS',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

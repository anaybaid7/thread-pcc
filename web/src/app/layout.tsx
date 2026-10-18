import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import { WardProvider } from '@/lib/ward'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'THREAD · Catch it early, then carry it through', template: '%s · THREAD' },
  description: 'Three workflows for long-term care: spot a change against a resident’s usual, size it up, and carry it across the shift change. Synthetic data.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA">
      <body>
        <WardProvider>
          <Shell>{children}</Shell>
        </WardProvider>
      </body>
    </html>
  )
}

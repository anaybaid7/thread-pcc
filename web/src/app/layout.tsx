import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import { DemoProvider } from '@/lib/demo'
import { WardProvider } from '@/lib/ward'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'THREAD · Catch it early, then carry it through', template: '%s · THREAD' },
  description: 'Long-term care: a change is carried from the PSW who notices it, to the nurse, across the shift change, to a recorded outcome. Synthetic data.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA">
      <body>
        <WardProvider>
          <DemoProvider>
            <Shell>{children}</Shell>
          </DemoProvider>
        </WardProvider>
      </body>
    </html>
  )
}

import '@fontsource/balsamiq-sans/400.css'
import '@fontsource/balsamiq-sans/700.css'
import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import { Providers } from '@/components/Providers'
import { Shell } from '@/components/Shell'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'THREAD · Resident concern threads', template: '%s · THREAD' },
  description:
    'Reconstructs a resident’s concern across shifts and shows when the evidence does not yet establish it is resolved. Synthetic data only.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA">
      <body>
        {/* Roughens borders into hand-drawn lines. Applied only to border layers, never to text. */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
          <filter id="sketch" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="1.8" />
          </filter>
        </svg>
        <Providers>
          <Suspense>
            <Shell>{children}</Shell>
          </Suspense>
        </Providers>
      </body>
    </html>
  )
}

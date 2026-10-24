import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import { Suspense } from "react"

import "@/styles/globals.css"
import { AppHeader } from "@/components/app-header"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { NavigationProvider } from "@/components/navigation-state"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: {
    default: "ShowList — track movies & series",
    template: "%s · ShowList",
  },
  description:
    "A minimal tracker for movies and series. Keep a watchlist, tick episodes you've seen, and see what airs next.",
}

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "[scrollbar-gutter:stable] antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body suppressHydrationWarning>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <ThemeProvider>
              <Suspense
                fallback={
                  <p
                    role="status"
                    className="p-6 text-sm text-muted-foreground"
                  >
                    Loading ShowList…
                  </p>
                }
              >
                <NavigationProvider>
                  <AppHeader />
                  {children}
                </NavigationProvider>
              </Suspense>
            </ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}

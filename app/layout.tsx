import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Geist_Mono, Inter } from "next/font/google"
import Link from "next/link"

import "@/styles/globals.css"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body suppressHydrationWarning>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <ThemeProvider>
              <header className="flex h-14 items-center justify-between gap-2 border-b px-6">
                <Link href="/" className="font-semibold tracking-tight">
                  ShowList
                </Link>
                <div className="flex items-center gap-2">
                  <Show when="signed-out">
                    <SignInButton>
                      <Button variant="ghost" size="sm">
                        Sign in
                      </Button>
                    </SignInButton>
                    <SignUpButton>
                      <Button size="sm">Sign up</Button>
                    </SignUpButton>
                  </Show>
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                </div>
              </header>
              {children}
            </ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}

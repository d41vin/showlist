import { BrowseDrawer } from "@/components/browse-drawer"

export default function BrowseLayout({
  children,
  drawer,
}: {
  children: React.ReactNode
  drawer: React.ReactNode
}) {
  return (
    <>
      {children}
      {drawer}
      <BrowseDrawer />
    </>
  )
}

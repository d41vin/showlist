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
    </>
  )
}

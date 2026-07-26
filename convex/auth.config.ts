const authConfig = {
  providers: [
    {
      // Clerk issuer domain (Frontend API URL), set on the Convex deployment:
      // npx convex env set CLERK_JWT_ISSUER_DOMAIN https://...
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
}

export default authConfig

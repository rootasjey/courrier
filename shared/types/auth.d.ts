declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    displayName: string
  }

  interface UserSession {
    activeWorkspaceId: string
  }

  interface SecureSessionData {
    sessionVersion: number
  }
}

export {}

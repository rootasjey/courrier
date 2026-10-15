declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    displayName: string
  }

  interface UserSession {
    activeWorkspaceId: string | null
  }

  interface SecureSessionData {
    sessionVersion: number
    mfaVerifiedAt?: number
    mfaMethod?: 'passkey' | 'recovery_code'
  }
}

export {}

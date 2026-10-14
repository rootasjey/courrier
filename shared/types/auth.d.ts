declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    displayName: string
  }

  interface UserSession {
    sessionVersion: number
  }
}

export {}

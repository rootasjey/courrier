export type CloudflareRoutingTokenBindings = {
  COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN?: string
  COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN?: string
}

/** Exposes only whether Worker secrets exist, never their values. */
export function cloudflareRoutingTokenStatus(bindings?: CloudflareRoutingTokenBindings) {
  return {
    readConfigured: Boolean(bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN?.trim()),
    writeConfigured: Boolean(bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN?.trim()),
  }
}

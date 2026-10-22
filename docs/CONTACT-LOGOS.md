# Contact company logos

Courrier can suggest a company logo from the sender's email domain through Logo.dev. A saved contact photo always takes priority. Common personal mailbox domains (such as Gmail, Outlook, iCloud, and Yahoo) are excluded so that a person's avatar is not replaced by a mail provider's logo. If no key is configured, or the image fails to load, Courrier keeps showing initials.

To enable the pilot locally, add a Logo.dev publishable key to `.dev.vars`:

```dotenv
LOGO_DEV_PUBLISHABLE_KEY=your_publishable_key
```

The same variable can be added to the Worker's runtime configuration when enabling it in production. Logo.dev documents the key as publishable and intended for use in an image URL. Its privacy policy says requests can include the client's IP address, queried domain, and timestamp; the pilot sends the domain only, and suppresses the browser referrer. Review Logo.dev's current plan and attribution terms before enabling it for commercial use.

No database migration is needed. This is a domain-derived suggestion; it does not save or replace a contact's manually uploaded photo.

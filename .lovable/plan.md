## Goal

Create a working sign-in account that Google Play reviewers can use to access the restricted area of SoupyTag (the admin dashboard at `/admin`), so the "App access" step in Play Console passes review.

## Credentials to create

- **Email:** `reviewer@soupytag.company`
- **Password:** `ReviewPass2024!`

## What I'll do

1. **Create the auth user** in Lovable Cloud (your backend) with the email and password above, and mark the email as already confirmed so the reviewer can sign in immediately without needing to click a confirmation link.

2. **Grant the reviewer the `admin` role** so that after signing in at `/login`, they actually land on the `/admin` dashboard instead of being bounced back to the login page.
   - Without this step, the login would succeed but the admin check would reject them and redirect them in a loop — Google's reviewer would report "credentials don't work."
   - The dashboard only shows order records (app name, package name, customer email, status). No payment details, no secrets. Acceptable for a Play review account.

3. **Verify** by listing the user and their role in the database after creation, so we know the credentials are live before you paste them into Play Console.

## What you'll paste into Play Console

Under **App access → All or some functionality is restricted → Add new instructions:**

- **Name:** Admin dashboard
- **Username:** `reviewer@soupytag.company`
- **Password:** `ReviewPass2024!`
- **Sign-in URL:** `https://soupytag.company/login`
- **Any other information:** "Sign in with the credentials above to access the internal orders dashboard. The main app at the home page works fully without an account."

## Notes

- This account is permanent until you delete it. If you ever want to revoke Google's access (e.g. after review passes), I can remove the user in one step.
- The password is fine for a review account but is now visible in chat history — let me know if you'd like a different one.
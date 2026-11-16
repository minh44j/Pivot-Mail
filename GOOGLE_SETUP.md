# Google setup checklist (do this once in EACH Workspace)

Workspaces: **pivottmc.com** (Pivot Travel Management) and **pivotscl.com** (Pivot Shipping).
Do every step below twice, signed in as a super administrator of that Workspace. The result is **two Internal Cloud projects and two Client IDs**.
⚠️ Verify with specialist: Google renames console pages and changes scope rules. If a name below differs, follow Google's current documentation for the same step.

## Values to use
| Item | Value |
|---|---|
| Project name | Pivot Mail |
| App name on the consent screen | Pivot Mail |
| User type | **Internal** |
| Authorised JavaScript origins | `https://mail.pivotscl.com` and `https://pivot-mail-web.vercel.app` |
| Authorised redirect URIs | `https://mail.pivotscl.com/api/auth/google/callback` and `https://pivot-mail-web.vercel.app/api/auth/google/callback` |
| Development only (add too) | `http://localhost:5173` and `http://localhost:5173/api/auth/google/callback` |
| Scopes | `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/contacts.readonly`, `https://www.googleapis.com/auth/directory.readonly` |
| APIs to enable | Gmail API, People API (later: Cloud Pub/Sub API, Google Drive API) |

`gmail.modify` covers reading, labelling, archiving, trashing and sending. Do **not** add the broad `https://mail.google.com/` scope.

## Checklist (per Workspace)
- [ ] 1. Open console.cloud.google.com signed in as the super administrator. Make sure the organisation shown at the top is the right Workspace.
- [ ] 2. Create a project named **Pivot Mail** inside that organisation.
- [ ] 3. APIs & Services → Library: enable **Gmail API** and **People API**.
- [ ] 4. APIs & Services → OAuth consent screen (Google Auth Platform): choose **Internal**. App name Pivot Mail, user support email = your admin address, developer contact = your admin address. Logo: `brand/logo-original.png` (optional).
- [ ] 5. Data access (scopes): add the six scopes in the table above. Save.
- [ ] 6. Credentials → Create credentials → OAuth client ID → **Web application**, name "Pivot Mail web". Add the origins and redirect URIs from the table. Create.
- [ ] 7. Copy the **Client ID** (safe to share). Download or copy the **Client secret** but do **not** paste it in chat, email or the repo.
- [ ] 8. Vercel → project `pivot-mail-web` → Settings → Environment Variables, add (Production and Preview):
  - pivottmc.com project: `GOOGLE_CLIENT_ID_TMC`, `GOOGLE_CLIENT_SECRET_TMC`
  - pivotscl.com project: `GOOGLE_CLIENT_ID_SCL`, `GOOGLE_CLIENT_SECRET_SCL`
  - one shared random value for `SESSION_SECRET` (32+ random characters), created once.
  - `ADMIN_EMAILS`: comma-separated addresses of the administrators (for example `you@pivotscl.com,you@pivottmc.com`). Until roles move to the database, this list decides who is an administrator.
- [ ] 9. Admin console (admin.google.com) → Security → Access and data control → API controls: if third-party app access is restricted, mark the **Pivot Mail** client as **Trusted**.
- [ ] 10. Test with one staff account of that Workspace once phase 1 is deployed.

## Decisions to send me with the Client IDs
1. **Shared mailboxes (ops@ and ticketing@):** how should staff open them?
   - (a) **Recommended for now:** add each shared mailbox as its own account in Pivot Mail (signing in to that Google account once), exactly like today's shared login. Pivot Mail then records who did what in its own log.
   - (b) Gmail delegation. ⚠️ Verify with specialist: I believe the Gmail API does not let a delegate's own sign-in read the delegator's mailbox, so this may not work.
   - (c) A service account with domain-wide delegation: strongest, but needs careful admin approval of exact scopes. Later option.
2. **First-sync window:** 90 days, 1 year (recommended) or everything.
3. **Number rules:** digit count and year rule for PS and PT references, confirmed with Pivot OS.

## Send me
| What | pivottmc.com | pivotscl.com |
|---|---|---|
| Client ID | ☐ | ☐ |
| Environment variables added in Vercel (yes/no) | ☐ | ☐ |
| Test staff address for the pilot | ☐ | ☐ |

## Later: Windows (and Mac) desktop app
- No change to the setup above. The desktop app signs in through the **system browser** (Google blocks sign-in inside embedded web views), against the same Vercel server and the same Web client.
- After Google's callback, the server hands a one-time code back to the app through a loopback address (`http://127.0.0.1:<random port>`), and the app exchanges it for its own session. Tokens stay on the server.
- An "Authorised origin" is only needed for the browser version. A desktop wrapper that serves the page from its own address (for example `tauri://localhost`) cannot be used as an origin, which is why sign-in does not happen inside it.
- Only if we ever store Google tokens on the device itself would we add a separate **Desktop app** OAuth client (loopback redirect with PKCE). Not planned. ⚠️ Verify with specialist against Google's current OAuth guidance for installed apps.

## Custom address: mail.pivotscl.com
1. **Check DNS first.** If `mail.pivotscl.com` already exists (for example the old Gmail shortcut `CNAME ghs.googlehosted.com`), it must be removed or renamed before pointing it at Vercel. MX records for email are not affected by a subdomain.
2. Vercel → `pivot-mail-web` → Settings → Domains → add `mail.pivotscl.com`. Create the DNS record Vercel shows (normally a `CNAME` for `mail` to Vercel's target). Wait until the domain shows as valid; the certificate is automatic.
3. Add the two `mail.pivotscl.com` entries (origin and redirect URI) in **both** Cloud projects. Keep the `vercel.app` entries while testing, then remove them.
4. Session cookies stay host-only on `mail.pivotscl.com` (never `.pivotscl.com`), so other subdomains cannot read them.
5. The same address serves both companies. ⚠️ Decide whether pivottmc.com staff are comfortable using a pivotscl.com address, or whether to use a neutral one later (a new Vercel domain and two more redirect URIs).
6. ⚠️ Verify with specialist: if the consent screen asks for an "authorised domain", add `pivotscl.com` in each project.

## Update: each company uses its own address
`mail.pivotscl.com` and `mail.pivottmc.com` both point to the same Vercel project. Register in each Google project the address that company's staff use:

| Google project | Authorised origin | Authorised redirect URI |
|---|---|---|
| pivotscl.com | `https://mail.pivotscl.com` | `https://mail.pivotscl.com/api/auth/google/callback` |
| pivottmc.com | `https://mail.pivottmc.com` | `https://mail.pivottmc.com/api/auth/google/callback` |

Optional in both while testing: the two `pivot-mail-web.vercel.app` entries. Sign-in returns to the address the person opened, so cookies stay host-only on each address.
⚠️ Verify: Vercel's Hobby plan is for personal, non-commercial use. A company tool normally needs a paid Vercel plan; confirm Vercel's current terms before staff use it.

## Phase 2 additions (connecting mailboxes)
- **Environment variables** (Vercel): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TOKEN_ENCRYPTION_KEY`. Optional: `REQUIRE_INVITE=true` refuses sign-in for anyone an administrator has not added.
- **Scopes** must already be listed under Data Access in both Google projects: `gmail.modify`, `contacts.readonly`, `directory.readonly` (plus the three identity scopes).
- **Both addresses in both projects (recommended):** adding a mailbox uses the Google project of the *mailbox's* company, on whichever address the person opened. So also add `https://mail.pivottmc.com` and `https://mail.pivottmc.com/api/auth/google/callback` to the pivotscl.com project, and the two `mail.pivotscl.com` entries to the pivottmc.com project. Without it, only mailboxes of the same company as the address in use can be added.
- On the first connection Google shows a consent screen listing the permissions. Tick all of them.

## Adding a mailbox from the other company's address
Example: signed in on `mail.pivotscl.com` and adding `minhaj@pivottmc.com`. Pivot Mail uses the **pivottmc.com** Google project for that mailbox, but sends Google back to the address you are on. If that address is not registered in the pivottmc.com project, Google shows **redirect_uri_mismatch**. Fix: in the pivottmc.com project, Clients, add
- origin `https://mail.pivotscl.com`
- redirect URI `https://mail.pivotscl.com/api/auth/google/callback`

and in the pivotscl.com project add the two `mail.pivottmc.com` entries (the same, the other way round). A personal mailbox you add this way is private to you.

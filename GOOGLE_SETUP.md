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
| Authorised JavaScript origin | `https://pivot-mail-web.vercel.app` |
| Authorised redirect URI | `https://pivot-mail-web.vercel.app/api/auth/google/callback` |
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

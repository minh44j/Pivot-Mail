# Pivot OS link

Pivot Mail takes reference numbers, client / port / salesperson pick-lists and case facts from
Pivot OS. Pivot Mail never writes into the Pivot OS database: it calls a few signed endpoints that
Pivot OS provides (`/api/integrations/pivot-mail/*`, see `docs/Pivot_Mail_link.md` in Pivot OS), and
Pivot OS checks the person's own permissions.

## What changes for staff when it is on

- **Ref No.** opens the same form as Pivot OS. Clients, standard ports and salespeople are Pivot OS's own lists.
- The number is issued by Pivot OS (`PS2600892`, `PT2600017`) and, for shipping, the job is opened there too.
- The Details panel shows the client, mode, route and status as Pivot OS has them.
- Typing an existing number into **I already have a number** still registers it here without asking Pivot OS for a new one.

- **Signatures:** every mailbox signs with its official Pivot OS signature (the same picture signature as Pivot OS's
  `/signature` page, one choice per job title) on new mail, replies and forwards, without anyone pasting it in. A person
  who set up their own signature on a computer keeps it there; the official one is offered in the list. Pivot Mail asks
  `POST /api/integrations/pivot-mail/signature` with the person's own mailboxes only (`/api/accounts/signatures`); until
  Pivot OS has that endpoint nothing changes.

## Turning it on (in this order)

1. Merge the Pivot OS branch `claude/pivot-mail-link` and let it deploy.
2. Make a secret of at least 32 random characters. Do not paste it in chat or in a file.
3. In the **Pivot OS** Vercel project set `PIVOT_MAIL_LINK_SECRET` to that secret.
4. In the **Pivot Mail** Vercel project set `PIVOT_OS_LINK_SECRET` to the same secret and `PIVOT_OS_URL` to Pivot OS's address (https only).
5. Redeploy both. Open Ref No. in Pivot Mail: the notice now says "Connected to Pivot OS".

While either variable is missing, Pivot Mail keeps making provisional numbers from 90001 (no change for staff).

To rotate the secret: change it in both projects and redeploy both. The old one stops working at once.

## If Pivot OS is down

Opening a job shows "Pivot OS could not be reached" and makes no number. People can still register a number
they already have. A number that Pivot OS issued but Pivot Mail could not save is named in the message.

## Who may do what

Each call names the person (their address) and the company (`PIVS` for the `pivotscl.com` mail, `PIVT` for
`pivottmc.com`). A person must exist and be active in Pivot OS with a role in that company, and must hold
`shipping.reference.write` (shipping) or `travel.bookings.write` (travel). Someone who cannot open a job in
Pivot OS cannot open one from Pivot Mail.

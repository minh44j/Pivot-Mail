# Pivot Mail for Mac — installing it

Works on any Mac with macOS 12 (Monterey) or newer, Apple Silicon (M1–M4) or Intel.

## 1. Download

- **Today (test build):** open the latest "Mac app" run on GitHub (Actions → Mac app), scroll to **Artifacts**, click
  **PivotMail-mac**. You must be signed in to GitHub. Safari unzips it to `PivotMail-<version>-mac.dmg`.
- **After the first release:** the Releases page of this repository, file `PivotMail-<version>-mac.dmg`.

## 2. Install

1. Double-click the `.dmg` file. A window opens with the Pivot Mail icon and the Applications folder.
2. Drag **Pivot Mail** onto **Applications**.
3. Eject the disk image (the eject arrow next to "Pivot Mail" in Finder's sidebar).

## 3. First start (once only)

The app is not registered with Apple (no paid Apple Developer account), so the Mac asks once:

- **macOS 15 (Sequoia) or newer:**
  1. Open Pivot Mail from Applications. A message says Apple could not verify it. Click **Done**.
  2. Open **System Settings → Privacy & Security**, scroll down to the line about Pivot Mail and click **Open Anyway**.
  3. Enter your Mac password, then click **Open**.
- **macOS 12–14:** in Applications, **right-click (or Control-click) Pivot Mail → Open → Open**.

After that it opens normally every time, from Launchpad, the Dock or Spotlight.

## 4. Inside the app

- When the Mac asks whether Pivot Mail may send notifications, choose **Allow** (new-mail alerts and the red unread number on
  the Dock both need it). Change it later in System Settings → Notifications → Pivot Mail.
- Sign in with **Continue with Google**: your browser opens, you sign in, and Pivot Mail continues by itself.
- **Open at Login** is on (Pivot Mail menu, or the Pivot symbol in the menu bar). Pivot Mail starts quietly when you log in.
- Closing the window keeps Pivot Mail running (alerts keep coming); click the Dock icon to bring it back. **⌘Q** quits.

## 5. Mac keys

| Key | Does |
|---|---|
| ⌘K or ⌘F | Search |
| ⌘R / ⌘⇧R / ⌘J | Reply / Reply all / Forward |
| ⌃Q / ⌘U | Mark as read / unread (⌘Q stays "Quit", as on every Mac) |
| ⌘C on attachments, then ⌘V | Paste the files into Finder, Mail, WhatsApp, Teams |
| ⌘Z | Undo the last change |

## Updates

A Mac app without Apple's paid certificate cannot replace itself. When a newer version is released, Pivot Mail shows an alert
and a **Download Pivot Mail x.y.z…** item in its menu-bar menu: download it and drag it to Applications again (choose
**Replace**). Mail, settings and sign-in stay as they are. (The mail screens themselves update with the website, instantly.)

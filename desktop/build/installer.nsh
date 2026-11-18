; Pivot Mail's package installer (run out of sight by PivotMail-Setup.exe). Uninstalling also removes what Setup added:
; the "Run at startup" entry and the desktop shortcut, so nothing of Pivot Mail is left behind.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.pivot.mail"
  Delete "$DESKTOP\Pivot Mail.lnk"
!macroend

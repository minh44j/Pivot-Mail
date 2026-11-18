; Branded wizard (preview): always install for the signed-in Windows user only, so the "Anyone who uses this computer /
; Only for me" question is not asked (no administrator rights needed).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

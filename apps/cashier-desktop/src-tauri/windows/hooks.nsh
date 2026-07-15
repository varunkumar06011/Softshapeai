!macro NSIS_HOOK_PREINSTALL
  ; Kill the main Cashier app and any orphaned edge-server sidecar before files are copied.
  nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
  Pop $R0
  nsis_tauri_utils::KillProcess "edge-server.exe"
  Pop $R0

  ; Give the OS and any AV real-time scanner a moment to release handles.
  Sleep 1000

  ; Force-delete any stale/locked/read-only leftover before writing the new binary.
  SetFileAttributes "$INSTDIR\edge-server.exe" NORMAL
  Delete /REBOOTOK "$INSTDIR\edge-server.exe"
!macroend

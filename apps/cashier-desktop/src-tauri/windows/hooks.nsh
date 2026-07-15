!macro NSIS_HOOK_PREINSTALL
  ; Kill the main Cashier app and any orphaned edge-server sidecar before files are copied.
  nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
  Pop $R0
  nsis_tauri_utils::KillProcess "edge-server.exe"
  Pop $R0

  ; Fallback: force-kill via taskkill in case the plugin missed it.
  nsExec::ExecToLog 'taskkill /F /IM "edge-server.exe"'
  Pop $R0

  ; Give the OS and any AV real-time scanner a moment to release handles.
  Sleep 2000

  ; Force-delete any stale/locked/read-only leftover before writing the new binary.
  SetFileAttributes "$INSTDIR\edge-server.exe" NORMAL

  ; Try plain delete first.
  Delete "$INSTDIR\edge-server.exe"

  ; If the file is still there (locked), rename it out of the way so the
  ; installer can write the fresh copy.  The old file is cleaned up on next
  ; reboot via /REBOOTOK on the renamed name.
  IfFileExists "$INSTDIR\edge-server.exe" 0 +4
    Rename /REBOOTOK "$INSTDIR\edge-server.exe" "$INSTDIR\edge-server.exe.old"
    IfErrors 0 +2
      Delete /REBOOTOK "$INSTDIR\edge-server.exe"
!macroend

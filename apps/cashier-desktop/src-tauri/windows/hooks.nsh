!macro NSIS_HOOK_PREINSTALL
  ; Kill the main Cashier app before files are copied.
  ; edge-server.exe and softshape-host.exe are bundled as resources.
  ; They are long-lived processes managed by the Runtime Host — don't kill them here.
  nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
  Pop $R0

  ; Give the OS and any AV real-time scanner a moment to release handles.
  Sleep 2000
!macroend

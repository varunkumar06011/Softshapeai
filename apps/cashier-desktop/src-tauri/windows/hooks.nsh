!macro NSIS_HOOK_PREINSTALL
  ; Kill the main Cashier app before files are copied.
  ; Phase 1.2: edge-server.exe is no longer bundled or killed — the Runtime
  ; is a separate long-lived process managed by the Softshape Runtime Host.
  nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
  Pop $R0

  ; Give the OS and any AV real-time scanner a moment to release handles.
  Sleep 2000
!macroend

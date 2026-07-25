!macro NSIS_HOOK_PREINSTALL
  ; Kill all SoftShape processes before files are copied.
  ; If edge-server.exe or softshape-host.exe are still running from a
  ; previous install, the installer can't replace them (file locked).
  nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
  Pop $R0
  nsis_tauri_utils::KillProcess "edge-server.exe"
  Pop $R0
  nsis_tauri_utils::KillProcess "softshape-host.exe"
  Pop $R0

  ; Give the OS and any AV real-time scanner a moment to release handles.
  Sleep 2000
!macroend

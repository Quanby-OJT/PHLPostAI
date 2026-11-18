/*! PHLPost Assistant widget (CHN-1). Embed with:
 *  <script src="https://YOUR-WEB-APP/widget.js" defer></script>
 */
(function () {
  if (window.__phlpostWidget) return
  window.__phlpostWidget = true

  var script = document.currentScript
  var origin = new URL(script && script.src ? script.src : window.location.href).origin
  var open = false

  var button = document.createElement("button")
  button.type = "button"
  button.setAttribute("aria-label", "Open PHLPost chat assistant")
  button.setAttribute("aria-expanded", "false")
  button.textContent = "Chat"

  var frame = document.createElement("iframe")
  frame.src = origin + "/assistant"
  frame.title = "PHLPost chat assistant"
  frame.hidden = true

  // Styles are set through the CSSOM (not a <style> tag) so a strict host-page CSP cannot block them.
  function layout() {
    var phone = window.matchMedia("(max-width: 480px)").matches
    button.style.cssText =
      "position:fixed;right:" + (phone ? "12" : "16") + "px;bottom:" + (phone ? "12" : "16") + "px;" +
      "z-index:2147483647;min-height:48px;min-width:72px;padding:0 20px;border:0;border-radius:24px;" +
      "background:#1d4ed8;color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.3)"
    frame.style.cssText = phone
      ? "position:fixed;z-index:2147483647;background:#fff;top:0;left:0;" +
        "width:100%;height:calc(100vh - 72px);height:calc(100dvh - 72px);max-width:none;max-height:none;border:0;border-radius:0"
      : "position:fixed;z-index:2147483647;background:#fff;right:16px;bottom:76px;width:380px;height:600px;" +
        "max-width:calc(100vw - 32px);max-height:calc(100dvh - 92px);border:1px solid #d4d4d8;" +
        "border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.25)"
  }

  function setOpen(next) {
    open = next
    frame.hidden = !open
    button.setAttribute("aria-expanded", String(open))
    button.setAttribute("aria-label", open ? "Close PHLPost chat assistant" : "Open PHLPost chat assistant")
    button.textContent = open ? "Close" : "Chat"
    if (open) frame.focus()
  }

  button.addEventListener("click", function () { setOpen(!open) })

  // Esc while focus is on the host page.
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) { setOpen(false); button.focus() }
  })

  // Esc while focus is inside the chat: the chat page asks us to close.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || event.source !== frame.contentWindow) return
    if (event.data && event.data.type === "phlpost-widget-close" && open) {
      setOpen(false)
      button.focus()
    }
  })

  window.matchMedia("(max-width: 480px)").addEventListener("change", layout)
  layout()

  function mount() {
    document.body.appendChild(frame)
    document.body.appendChild(button)
  }
  if (document.body) mount()
  else document.addEventListener("DOMContentLoaded", mount)
})()

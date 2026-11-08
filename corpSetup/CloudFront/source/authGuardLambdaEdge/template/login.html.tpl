<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Access Denied</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background-color: #f5f7fa;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .card {
        background: #ffffff;
        padding: 32px 40px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        text-align: center;
        max-width: 420px;
        width: 100%;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 22px;
        color: #333;
      }

      p {
        margin: 0 0 20px;
        color: #666;
        font-size: 14px;
        line-height: 1.6;
      }

      .btn {
        display: inline-block;
        padding: 12px 24px;
        background-color: #4f46e5;
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
      }

      .btn:hover {
        background-color: #4338ca;
      }

      .fallback {
        margin-top: 20px;
        font-size: 12px;
        color: #999;
        word-break: break-all;
      }

      .fallback code {
        display: block;
        margin-top: 6px;
        padding: 8px;
        background: #f3f4f6;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #333;
      }

      .errorMsg {
        margin-top: 12px;
        color: #e53e3e;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <!-- Processing login card (hidden initially) -->
    <div id="processing-card" class="card" style="display: none">
      <h1>Refreshing session</h1>
      <p>If nothing happens, refresh manually.</p>

      <button class="btn" onclick="window.location.reload()">refresh</button>
    </div>

    <!-- Original login card (shown initially) -->
    <div id="login-card" class="card">
      <h1>Login Required</h1>
      <p>You are not logged in or your session has expired.</p>

      <a class="btn" id="login-btn" href="${auth_domain}" target="_blank"> Click here to open the Login popup </a>
      <p id="errorMsg" class="errorMsg" style="display: none"></p>

      <!-- <div class="fallback">
        If the button does not work, copy and open this URL:
        <code>${auth_domain}</code>
      </div> -->
    </div>

    <script>
      (function () {
        const AUTH_URL = "${auth_domain}";
        const AUTH_ORIGIN = new URL(AUTH_URL).origin;
        function openLoginPopup() {
          try {
            const popup = window.open(AUTH_URL, "loginPopup", "width=500,height=650,resizable=yes");
            if (!popup) {
              return null;
            }
            function handler(event) {
              if (event.origin !== AUTH_ORIGIN) return;
              if (event.data?.authStatus === "SUCCESS") {
                window.removeEventListener("message", handler);
                popup.close();
                if (getCookie("idToken")) {
                  showManualLoginCard(false);
                  window.location.reload();
                }
              }
              if (event.data?.authStatus === "FAILED") {
                window.removeEventListener("message", handler);
                popup.close();
                console.error("Login failed");
                document.getElementById("errorMsg").innerHTML =
                  "The login failed. Please reload this page and try again. If the issue persists, please contact support.";
                document.getElementById("errorMsg").style.display = "block";
                document.getElementById("login-btn").style.display = "none";
              }
            }
            window.addEventListener("message", handler);
            return popup;
          } catch (err) {
            return null;
          }
        }

        document.getElementById("login-btn").addEventListener("click", function (e) {
          e.preventDefault();
          const popup = openLoginPopup();
          if (!popup) {
            // If popup failed to open (e.g., blocked), fallback to redirect
            document.getElementById("errorMsg").innerHTML =
              "The login popup failed, please click <a href='" +
              AUTH_URL +
              "' target='_blank'>here to open a new window</a> and refresh this page after you have logged in.";
            document.getElementById("errorMsg").style.display = "block";
            document.getElementById("login-btn").style.display = "none";
          }
        });

        function showManualLoginCard(isShowCard) {
          const processing = document.getElementById("processing-card");
          const login = document.getElementById("login-card");
          if (isShowCard) {
            processing.style.display = "none";
            login.style.display = "block";
          } else {
            processing.style.display = "block";
            login.style.display = "none";
          }
        }

        function getCookie(name) {
          const value = "; " + document.cookie;
          const parts = value.split("; " + name + "=");
          if (parts.length === 2) return parts.pop().split(";").shift();
          return null;
        }
        if (getCookie("idToken")) {
          showManualLoginCard(false);
        }
        window.addEventListener("load", function () {
          if (!getCookie("idToken")) {
            openLoginPopup();
          }
        });
      })();
    </script>
  </body>
</html>

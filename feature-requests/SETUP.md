# Collect feature requests in a Google Sheet

The website form can post straight into a Google Sheet. This uses a Google
Apps Script web app, which is free and needs no server. About five minutes.

1. Create a new Google Sheet (any name, e.g. "Smart Keyboard requests").
2. In it, open **Extensions > Apps Script**. Delete the sample code and paste
   in the contents of `Code.gs` from this folder. Save.
3. Click **Deploy > New deployment**. Under the gear icon choose **Web app**, then set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** and approve the permission prompt (Google will warn that
   the app is unverified; choose Advanced, then continue. It only touches
   this one sheet).
5. Copy the **Web app URL** (it ends in `/exec`).
6. Open `docs/index.html`, find `var ENDPOINT = '';` and paste the URL between
   the quotes. Commit and push; the site updates in a minute or two. Requests go only to the sheet, nothing is posted to GitHub.

To check it: open the web app URL in a browser. It should show "Smart Keyboard
feature requests: this address accepts form posts." Then send a request from
the site and a **Requests** tab appears in the sheet with the row.

Notes
- Every row gets the time received, name and email (both optional), the
  feature title, area and details.
- Values that start with `=`, `+`, `-` or `@` are saved with a leading
  apostrophe so nobody can slip a formula into your sheet.
- If you change `Code.gs` later, use **Deploy > Manage deployments > Edit >
  New version** so the same URL keeps working.

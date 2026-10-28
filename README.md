# Dad's Docs

This is a static Progressive Web App. It uploads files directly to the signed-in Google account's Drive using the `drive.file` permission.

## Before deploying

1. In Google Cloud Console, create a project and enable **Google Drive API**.
2. Configure the OAuth consent screen as **Production** and add your dad as a test user only if Google requires it during setup.
3. Create an **OAuth client ID** of type **Web application**.
4. Deploy this folder to Vercel. Choose **Other** as the framework and leave the build command blank.
5. Copy the production URL, for example `https://dads-docs.vercel.app`, into the OAuth client's **Authorized JavaScript origins**. Do not add a path or a trailing slash.
6. Replace `PASTE_YOUR_CLIENT_ID_HERE.apps.googleusercontent.com` at the top of `app.js` with the client ID. The client ID is public; do not put a client secret in this app.
7. Redeploy, open the site in Chrome on Android, sign in, then install it from Chrome's **Add to Home screen** menu.

## Test checklist

1. Tap **Take photo**, create a folder, and save the photo.
2. Confirm the file appears in **Dad's Documents** in Google Drive.
3. From Gallery, WhatsApp, and Chrome, use **Share** and choose **Dad's Docs**. Pick a folder and save.

The Share Target works after the app has been installed from Chrome on Android. This version needs an internet connection while saving.
